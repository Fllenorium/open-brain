import { ErrorScreen } from '@/components/shell/ErrorScreen'

export default function NotFound() {
  return (
    <ErrorScreen
      title="Nothing is here"
      blurb="That page doesn't exist, or the entry at this path was moved or deleted. Search from the workspace to find it."
    />
  )
}
