/* eslint-disable */
// Scans all .tsx files for raw text rendered inside non-<Text> host elements.
// Flags: (1) literal JSX text children of non-Text elements,
//        (2) {expr && 'string'} / ternaries yielding literals in non-Text elements.
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const TEXTISH = /^(text|animated\.text|moti\.text|svg\.text|styledtext|appbadge)$/i;
let issues = 0;

function walk(node, file, insideNonText, tagOf) {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    let tag = '';
    if (ts.isJsxElement(node)) {
      tag = node.openingElement.tagName.getText();
    } else {
      tag = node.tagName.getText();
    }
    const isText = TEXTISH.test(tag.trim());
    const selfClosing = ts.isJsxSelfClosingElement(node);
    if (!isText && !selfClosing && ts.isJsxElement(node)) {
      for (const child of node.children) {
        // (1) Literal JSX text
        if (ts.isJsxText(child) && child.getText().trim().length > 0) {
          report(file, child, `raw JSX text "${child.getText().trim()}" inside <${tag}>`);
        }
        // (2) {expr} that may yield a string/number
        if (ts.isJsxExpression(child) && child.expression) {
          checkExpr(child.expression, file, tag);
        }
      }
    }
    node.forEachChild((c) => walk(c, file, insideNonText, tag));
    return;
  }
  node.forEachChild((c) => walk(c, file, insideNonText, tagOf));
}

function checkExpr(expr, file, tag) {
  const e = expr;
  // {a && 'str'} / {a && (<Jsx>)} where right side has a string literal branch
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    scanForLiteral(e.right, tag, expr, file);
    return;
  }
  if (ts.isConditionalExpression(e)) {
    scanForLiteral(e.whenTrue, tag, expr, file);
    scanForLiteral(e.whenFalse, tag, expr, file);
    return;
  }
  scanForLiteral(e, tag, expr, file);
}

function scanForLiteral(node, tag, origExpr, file) {
  if (node == null) return;
  if (
    ts.isStringLiteralLike(node) ||
    ts.isNumericLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword
  ) {
    report(file, origExpr, `expression may render literal "${node.getText()}" inside <${tag}>`);
  } else if (ts.isTemplateExpression(node)) {
    report(file, origExpr, `template literal inside <${tag}>`);
  } else if (ts.isParenthesizedExpression(node)) {
    scanForLiteral(node.expression, tag, origExpr, file);
  } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    // string concatenation
    report(file, origExpr, `concatenated literal expression inside <${tag}>`);
  }
}

function report(file, node, msg) {
  issues++;
  const { line, character } = sf(file, node);
  console.log(`${file}:${line + 1}:${character + 1}  ${msg}`);
}
const posCache = {};
function sf(file, node) {
  return node.getSourceFile().getLineAndCharacterOfPosition(node.getStart());
}

function walkDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(p);
    else if (/\.tsx$/.test(entry.name)) {
      const code = fs.readFileSync(p, 'utf8');
      const sfile = ts.createSourceFile(p, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      sfile.forEachChild((n) => walk(n, p));
    }
  }
}
walkDir(SRC);
console.log(issues === 0 ? 'NO RAW-TEXT ISSUES FOUND' : `${issues} potential issue(s)`);
