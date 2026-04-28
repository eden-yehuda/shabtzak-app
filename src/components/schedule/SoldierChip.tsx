interface Props {
  name: string
  highlight?: boolean   // navy bg when it's the current soldier
  onRemove?: () => void // undefined = read-only
  isCommander?: boolean
}

export default function SoldierChip({ name, highlight, onRemove, isCommander }: Props) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
      highlight ? 'bg-white text-navy font-bold' : 'bg-blue-100 text-blue-800'
    }`}>
      {isCommander && <span>★</span>}
      {name}
      {onRemove && (
        <button onClick={onRemove} className="hover:text-red-500 ml-1">✕</button>
      )}
    </span>
  )
}
