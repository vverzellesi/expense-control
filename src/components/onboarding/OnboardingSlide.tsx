import { type LucideIcon } from "lucide-react"

interface OnboardingSlideProps {
  icon: LucideIcon
  title: string
  description: string
}

export function OnboardingSlide({
  icon: Icon,
  title,
  description,
}: OnboardingSlideProps) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
        <Icon className="h-8 w-8 text-emerald-500" />
      </div>

      <h2 className="mt-6 text-2xl font-bold text-gray-900">{title}</h2>

      <p className="mt-4 max-w-md text-muted-foreground">{description}</p>
    </div>
  )
}
