function getTotalRunwayLengthForSide(sideKey) {
  const columns = toNum(columnsPerSideInput.value, 0);
  let total = 0;

  for (let segment = 1; segment < columns; segment += 1) {
    total += getSegmentLengthFt(sideKey, segment);
  }

  return total;
}

function autoPopulateSurveyRunwayLength() {
  if (!surveyRunwayLengthFtEl) return;

  const northTotal = getTotalRunwayLengthForSide("sideA");
  const southTotal = getTotalRunwayLengthForSide("sideB");
  const runwayLength = Math.max(northTotal, southTotal);

  if (runwayLength > 0) {
    surveyRunwayLengthFtEl.value = String(runwayLength);
  }
}
