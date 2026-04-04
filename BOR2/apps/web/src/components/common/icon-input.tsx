import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"
import * as React from "react"

interface IconInputProps extends React.ComponentProps<"input"> {
  startIcon?: LucideIcon
  endIcon?: LucideIcon
  onEndIconClick?: () => void
}

const IconInput = React.forwardRef<HTMLInputElement, IconInputProps>(
  ({ className, startIcon: StartIcon, endIcon: EndIcon, onEndIconClick, ...props }, ref) => {
    return (
      <div className="relative">
        {StartIcon && (
          <StartIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        )}
        <Input
          ref={ref}
          className={cn(
            StartIcon && "pl-9",
            EndIcon && "pr-9",
            className
          )}
          {...props}
        />
        {EndIcon && (
          onEndIconClick ? (
            <button
              type="button"
              onClick={onEndIconClick}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <EndIcon className="h-4 w-4" />
            </button>
          ) : (
            <EndIcon className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          )
        )}
      </div>
    )
  }
)

IconInput.displayName = "IconInput"

export { IconInput }
