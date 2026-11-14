import {shapeFor} from '../data/chordShapes';

// Five frets are drawn. A shape that sits higher up the neck shows its starting fret.
export function ChordDiagram({name}: {name: string}) {
  const shape = shapeFor(name);
  if (!shape) return <div className="diagram"><strong>{name === 'N' ? 'Rest' : name}</strong></div>;
  const pressed = shape.frets.filter((f): f is number => f !== null && f > 0);
  const highest = pressed.length ? Math.max(...pressed) : 0;
  const base = highest > 5 ? Math.min(...pressed) : 1;
  return (
    <div className="diagram">
      <strong>{name}</strong>
      <svg viewBox="0 0 120 130" aria-label={`${name} chord`}>
        <path d="M20 20H100 M20 40H100 M20 60H100 M20 80H100 M20 100H100 M20 120H100" stroke="currentColor" />
        {base === 1 && <path d="M20 20H100" stroke="currentColor" strokeWidth="4" />}
        {base > 1 && <text x="108" y="34" fontSize="12" fill="currentColor">{base}fr</text>}
        {shape.frets.map((fret, i) => {
          const x = 20 + i * 16;
          const row = fret === null || fret === 0 ? 0 : fret - base + 1;
          return (
            <g key={i}>
              <line x1={x} y1="20" x2={x} y2="120" stroke="currentColor" />
              <text x={x} y="14" textAnchor="middle" fontSize="13">{fret === null ? '×' : fret === 0 ? '○' : ''}</text>
              {row > 0 && (
                <>
                  <circle cx={x} cy={10 + row * 20} r="7" fill="#faac57" />
                  <text x={x} y={14 + row * 20} textAnchor="middle" fontSize="10" fill="#102a35">{shape.fingers[i] || ''}</text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
