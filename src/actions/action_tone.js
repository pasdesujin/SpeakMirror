export function ToneResponse (data,tone) {
  return {
    type: 'TONE_RESPONSE',
    payload: JSON.stringify(tone.concat([data]))
  };
}