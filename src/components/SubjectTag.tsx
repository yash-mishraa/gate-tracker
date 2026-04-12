import { resolveSubjectColor } from '../utils/subjectColors';

interface SubjectTagProps {
  name: string;
  color?: string;
}

export function SubjectTag({ name, color }: SubjectTagProps) {
  const dotColor = resolveSubjectColor({ name, color });

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)' }}>
      <span
        aria-hidden
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: dotColor,
          flexShrink: 0
        }}
      />
      <span>{name}</span>
    </span>
  );
}
