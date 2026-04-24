export function unifiedDiff(
  originalLines: string[],
  modifiedLines: string[],
  filePath: string,
  maxLines = 500,
): string {
  const diff: string[] = [];
  diff.push(`--- ${filePath}`);
  diff.push(`+++ ${filePath}`);

  let i = 0;
  let j = 0;
  const originalLen = originalLines.length;
  const modifiedLen = modifiedLines.length;

  while (i < originalLen || j < modifiedLen) {
    if (diff.length > maxLines) {
      diff.push('... (diff truncated)');
      break;
    }

    if (i < originalLen && j < modifiedLen && originalLines[i] === modifiedLines[j]) {
      i++;
      j++;
      continue;
    }

    // Find the hunk bounds
    const oldStart = i + 1;
    const newStart = j + 1;

    let oldEnd = i;
    let newEnd = j;

    // Simple LCS-like scan: find next matching line
    let matchI = -1;
    let matchJ = -1;
    const maxLookahead = 100;
    for (let di = 0; di < maxLookahead && i + di < originalLen; di++) {
      for (let dj = 0; dj < maxLookahead && j + dj < modifiedLen; dj++) {
        if (originalLines[i + di] === modifiedLines[j + dj]) {
          matchI = i + di;
          matchJ = j + dj;
          break;
        }
      }
      if (matchI !== -1) break;
    }

    if (matchI === -1) {
      oldEnd = originalLen;
      newEnd = modifiedLen;
    } else {
      oldEnd = matchI;
      newEnd = matchJ;
    }

    const oldCount = oldEnd - i;
    const newCount = newEnd - j;
    diff.push(
      `@@ -${oldStart}${oldCount === 1 ? '' : ',' + oldCount} +${newStart}${newCount === 1 ? '' : ',' + newCount} @@`,
    );

    for (let k = i; k < oldEnd; k++) {
      diff.push('-' + originalLines[k]);
    }
    for (let k = j; k < newEnd; k++) {
      diff.push('+' + modifiedLines[k]);
    }

    i = oldEnd;
    j = newEnd;
  }

  return diff.join('\n');
}
