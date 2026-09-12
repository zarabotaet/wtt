export function SectionHeader({ label, id }: { label: string; id?: string }) {
  return (
    <div className="boundary" id={id}>
      {label}
    </div>
  );
}
