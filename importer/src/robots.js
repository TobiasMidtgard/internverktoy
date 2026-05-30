// Minimal robots parser: only the "User-agent: *" group's Disallow prefixes (our UA is generic).
export function parseRobots(txt){
  const lines = txt.split(/\r?\n/).map(l => l.replace(/#.*$/,'').trim());
  const disallow = [];
  let inStar = false;
  for (const line of lines){
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const field = m[1].toLowerCase(), val = m[2].trim();
    if (field === 'user-agent') inStar = (val === '*');
    else if (field === 'disallow' && inStar && val) disallow.push(val);
  }
  return { disallow };
}

export function isAllowed(robots, path){
  return !robots.disallow.some(prefix => path.startsWith(prefix));
}
