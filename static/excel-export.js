(function attachHQuinnExcel(root) {
  "use strict";

  const MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const LAYERS = [
    ["Primary analytical system", "primary"],
    ["Supporting workflow", "supporting"],
    ["Site, software, service, and tertiary", "tertiary"],
  ];

  function cleanText(value) {
    if (value === null || value === undefined) return "";
    const text = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
    return /^[=+\-@]/.test(text) ? `'${text}` : text;
  }

  function xml(value) {
    return cleanText(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function cellReference(column, row) {
    let dividend = column + 1;
    let letters = "";
    while (dividend > 0) {
      const modulo = (dividend - 1) % 26;
      letters = String.fromCharCode(65 + modulo) + letters;
      dividend = Math.floor((dividend - modulo) / 26);
    }
    return `${letters}${row}`;
  }

  function worksheetXml({ rows, widths, headerRow = 4, mergeTo, filter = true }) {
    const columnCount = Math.max(1, widths.length);
    const rowCount = Math.max(1, rows.length);
    const endCell = cellReference(columnCount - 1, rowCount);
    const cells = rows.map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const height = row.height ? ` ht="${row.height}" customHeight="1"` : "";
      const cellXml = row.values.map((value, columnIndex) => {
        const reference = cellReference(columnIndex, rowNumber);
        const style = row.style ?? (rowNumber === headerRow ? 2 : 4);
        return `<c r="${reference}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
      }).join("");
      return `<row r="${rowNumber}"${height}>${cellXml}</row>`;
    }).join("");
    const columns = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("");
    const filterRef = filter && rowCount >= headerRow ? `<autoFilter ref="A${headerRow}:${cellReference(columnCount - 1, rowCount)}"/>` : "";
    const mergeRef = mergeTo ? `<mergeCells count="1"><mergeCell ref="A1:${cellReference(mergeTo - 1, 1)}"/></mergeCells>` : "";
    const freeze = headerRow ? `<pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${endCell}"/>
  <sheetViews><sheetView workbookViewId="0">${freeze}</sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="16"/>
  <cols>${columns}</cols>
  <sheetData>${cells}</sheetData>
  ${filterRef}${mergeRef}
  <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
</worksheet>`;
  }

  function titleRows(title, note, headers) {
    return [
      { values: [title], style: 1, height: 27 },
      { values: [note], style: 3, height: 22 },
      { values: headers.map(() => ""), style: 0, height: 7 },
      { values: headers, style: 2, height: 24 },
    ];
  }

  function sourceLocation(source = {}) {
    return source.location || source.path || source.sourcePath || "";
  }

  function isMissingValue(value) {
    const normalized = String(value ?? "").trim().toLowerCase();
    return !normalized || ["not provided", "not confirmed", "unknown", "n/a", "n.a."].includes(normalized);
  }

  function normalizeItem(layer, item = {}) {
    return [
      layer,
      item.name || item.title || "Unnamed item",
      item.sku || item.partNumber || item.part_number || item.catalogNumber || "",
      item.quantity ?? item.qty ?? "",
      item.status || "",
      item.role || item.type || item.category || "",
      item.reason || item.rationale || item.description || "",
      item.sourceId || item.evidenceId || item.source || "",
      item.sourcePath || item.path || item.location || "",
      item.notes || item.note || "",
    ];
  }

  function buildSheets(payload) {
    const exportedAt = new Date().toISOString();
    const title = payload.title || "HQuinn configuration";
    const configuration = payload.configuration || {};
    const buildHeaders = ["Layer", "Item / product name", "SKU / part number", "Quantity", "Status", "Configuration role", "Rationale / requirement fit", "Source ID", "Source location", "Notes"];
    const buildRows = titleRows(
      "HQuinn CMD EFS configuration",
      `${title} | Version ${payload.version || 0} | Exported ${exportedAt} | Preliminary build: validate current CPQ, regional availability, compatibility, service, licensing, and price before quote release.`,
      buildHeaders,
    );
    LAYERS.forEach(([label, key]) => {
      (configuration[key] || []).forEach((item) => buildRows.push({ values: normalizeItem(label, item), style: 4, height: 38 }));
    });

    const contextRows = titleRows("Configuration context", `${title} | Exported ${exportedAt}`, ["Field", "Value", "Status"]);
    const context = [
      ["Consultation title", title, ""],
      ["Version", payload.version || 0, ""],
      ["Phase", payload.phase || "", ""],
      ["Working solution maturity", payload.readiness === undefined ? "" : `${payload.readiness}%`, "Preliminary"],
      ["Platform", payload.platform || "", ""],
      ["Package decision", payload.packageDecision || "", ""],
      ["Sample preparation", payload.samplePrep || "", ""],
      ["UPS", payload.ups || "", ""],
      ["Configuration approach", configuration.approach || "", ""],
    ];
    Object.entries(payload.requirements || {}).forEach(([key, value]) => context.push([`Requirement: ${key}`, value ?? "", isMissingValue(value) ? "Not provided" : "Provided"]));
    (payload.packageCandidates || []).forEach((item) => context.push(["Strong package candidate", item.name || item.title || "", item.fit || "strong"]));
    (payload.alternatives || []).forEach((item) => context.push(["Credible alternative", item.name || item.title || "", item.fit || "conditional"]));
    context.forEach((values) => contextRows.push({ values, style: values[2] === "Not provided" ? 6 : 4, height: 26 }));
    if ((payload.history || []).length) {
      contextRows.push({ values: ["Decision history", "", ""], style: 5, height: 22 });
      payload.history.forEach((item) => contextRows.push({ values: [`Version ${item.version ?? ""}: ${item.title || "Decision"}`, item.detail || "", item.time || ""], style: 4, height: 32 }));
    }

    const validationRows = titleRows("Validation and open items", `${title} | Exported ${exportedAt}`, ["Type", "Status", "Item", "Detail"]);
    (payload.validationGates || []).forEach((gate) => validationRows.push({ values: ["Validation gate", gate.status || "open", gate.title || "", gate.detail || ""], style: gate.status === "block" ? 6 : 4, height: 34 }));
    (payload.unknowns || []).forEach((item) => validationRows.push({ values: ["Refinement", "Open", item, "Useful for improving the working configuration; not automatically a blocker."], style: 4, height: 30 }));
    (payload.conflicts || []).forEach((item) => validationRows.push({ values: ["Evidence conflict", "Review", item, "Resolve against the controlling source before quote release."], style: 6, height: 30 }));

    const evidenceRows = titleRows("Evidence", `${title} | Exported ${exportedAt}`, ["Source ID", "Type", "Title", "Source location", "Locator", "Supports / excerpt"]);
    (payload.evidence || []).forEach((source) => evidenceRows.push({ values: [source.id || "", source.type || "", source.title || "", sourceLocation(source), source.locator || "", source.supports || source.excerpt || ""], style: 4, height: 42 }));

    const chatRows = titleRows("Chat history", `${title} | Exported ${exportedAt}`, ["Sequence", "Speaker", "Title", "Message", "Evidence references"]);
    (payload.messages || []).forEach((message, index) => {
      const body = message.text || (Array.isArray(message.paragraphs) ? message.paragraphs.join("\n\n") : message.message || "");
      const sources = Array.isArray(message.sources) ? message.sources.join(" | ") : "";
      chatRows.push({ values: [index + 1, message.type === "user" ? "User" : "HQuinn", message.title || "", body, sources], style: 4, height: 50 });
    });

    return [
      { name: "Build", rows: buildRows, widths: [26, 34, 22, 14, 14, 21, 54, 22, 55, 28], mergeTo: buildHeaders.length },
      { name: "Context", rows: contextRows, widths: [31, 74, 20], mergeTo: 3 },
      { name: "Validation", rows: validationRows, widths: [21, 15, 40, 78], mergeTo: 4 },
      { name: "Evidence", rows: evidenceRows, widths: [20, 20, 42, 62, 22, 80], mergeTo: 6 },
      { name: "Chat History", rows: chatRows, widths: [10, 14, 34, 92, 48], mergeTo: 5 },
    ];
  }

  function stylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="10"/><name val="Arial"/><family val="2"/><color rgb="FF1D1D1F"/></font>
    <font><b/><sz val="10"/><name val="Arial"/><family val="2"/><color rgb="FFFFFFFF"/></font>
    <font><b/><sz val="15"/><name val="Arial"/><family val="2"/><color rgb="FF1D1D1F"/></font>
    <font><i/><sz val="9"/><name val="Arial"/><family val="2"/><color rgb="FF6E6E73"/></font>
  </fonts>
  <fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1D1D1F"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF3FF"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF4DF"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD5D5DA"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  }

  async function createConfigurationWorkbook(payload, outputType = "blob") {
    if (typeof root.JSZip !== "function") throw new Error("Excel export support did not load.");
    const sheets = buildSheets(payload);
    const zip = new root.JSZip();
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
    zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
    zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets><calcPr calcId="0"/></workbook>`);
    zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.file("xl/styles.xml", stylesXml());
    sheets.forEach((sheet, index) => zip.file(`xl/worksheets/sheet${index + 1}.xml`, worksheetXml(sheet)));
    const now = new Date().toISOString();
    zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(payload.title || "HQuinn configuration")}</dc:title><dc:creator>HQuinn CMD EFS Copilot</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
    zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>HQuinn CMD EFS Copilot</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${sheets.map((sheet) => `<vt:lpstr>${xml(sheet.name)}</vt:lpstr>`).join("")}</vt:vector></TitlesOfParts></Properties>`);
    return zip.generateAsync({ type: outputType, mimeType: MIME_TYPE, compression: "DEFLATE", compressionOptions: { level: 6 } });
  }

  function filenameFor(payload) {
    const safeTitle = cleanText(payload.title || "Configuration").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 54) || "Configuration";
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    return `HQuinn_${safeTitle}_v${payload.version || 0}_${stamp}.xlsx`;
  }

  async function downloadConfigurationWorkbook(payload) {
    const itemCount = LAYERS.reduce((total, [, key]) => total + ((payload.configuration || {})[key] || []).length, 0);
    if (!itemCount) throw new Error("Build a configuration before exporting.");
    const blob = await createConfigurationWorkbook(payload, "blob");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filenameFor(payload);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { filename: link.download, itemCount };
  }

  root.HQuinnExcel = { buildSheets, createConfigurationWorkbook, downloadConfigurationWorkbook, filenameFor };
})(typeof window !== "undefined" ? window : globalThis);
