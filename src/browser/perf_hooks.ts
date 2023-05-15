// This is used in the browser
function now(): number {
  return Date.now();
}

export const performance = {
  now,
};
