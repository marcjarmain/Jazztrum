import {chordShapes} from '../data/chords';

type ChordName = keyof typeof chordShapes;

// Finger numbers per string for each chord (thick low E first).
const fingers: Record<ChordName, number[]> = {
  A9: [0, 0, 1, 3, 2, 4],
  Em: [0, 3, 2, 0, 0, 0],
};

export function ChordDiagram({name}: {name: ChordName}) {
  const shape = chordShapes[name];
  return (
    <div className="diagram">
      <strong>{name}</strong>
      <svg viewBox="0 0 120 105" aria-label={`${name} chord`}>
        <path d="M20 20H100 M20 40H100 M20 60H100 M20 80H100" stroke="currentColor" />
        {shape.map((fret, i) => {
          const x = 20 + i * 16;
          return (
            <g key={i}>
              <line x1={x} y1="20" x2={x} y2="85" stroke="currentColor" />
              <text x={x} y="14" textAnchor="middle" fontSize="13">
                {fret === null ? '×' : fret === 0 ? '○' : ''}
              </text>
              {fret !== null && fret > 0 && (
                <>
                  <circle cx={x} cy={10 + fret * 20} r="7" fill="#faac57" />
                  <text x={x} y={14 + fret * 20} textAnchor="middle" fontSize="10" fill="#102a35">
                    {name === 'A9' ? fingers.A9[i] : i === 1 ? 2 : 3}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
