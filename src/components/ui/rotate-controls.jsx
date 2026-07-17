import { RotateCcw } from 'lucide-react'
import { Button } from './button'
import { FormGrid } from './form'

export function RotateControls({ value, onChange, className }) {
  return (
    <FormGrid cols={3} gap={2} className={className}>
      <Button size="md" onClick={() => onChange(value - 90)}>−90°</Button>
      <Button size="md" onClick={() => onChange(0)} aria-label="Reset rotation">
        <RotateCcw className="h-4 w-4" />
      </Button>
      <Button size="md" onClick={() => onChange(value + 90)}>+90°</Button>
    </FormGrid>
  )
}
