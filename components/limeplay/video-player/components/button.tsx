import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  `
    inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full text-xs font-medium whitespace-nowrap
    transition-[background-color,color,box-shadow,scale,backdrop-filter] duration-200 ease-out
    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70
    active:scale-[0.94]
    disabled:pointer-events-none disabled:opacity-50
    motion-reduce:transition-none
    motion-reduce:active:scale-100
    @md/root:gap-2 @md/root:text-sm
    [&_svg]:pointer-events-none [&_svg]:shrink-0
    [&_svg:not([class*='size-'])]:size-4
    @3xl/root:[&_svg:not([class*='size-'])]:size-4.5
  `,
  {
    defaultVariants: {
      size: "default",
      variant: "default",
    },
    variants: {
      size: {
        default: `
          h-9 px-3.5 py-1.5
          has-[>svg]:px-3
          @md/root:h-10 @md/root:px-4 @md/root:py-2
          @md/root:has-[>svg]:px-3.5
          @3xl/root:h-11 @3xl/root:px-5
          @3xl/root:has-[>svg]:px-4
        `,
        icon: `
          size-8 rounded-full p-1.5
          @md/root:size-9 @md/root:p-2
          @3xl/root:size-10
        `,
        lg: `
          h-10 rounded-full px-4
          has-[>svg]:px-3
          @md/root:h-11 @md/root:px-6
          @md/root:has-[>svg]:px-4
          @3xl/root:h-12 @3xl/root:px-7
          @3xl/root:has-[>svg]:px-5
        `,
        sm: `
          h-7 gap-1.5 rounded-full px-2.5 text-xs
          has-[>svg]:px-2
          @md/root:h-8 @md/root:px-3 @md/root:text-sm
          @md/root:has-[>svg]:px-2.5
          @3xl/root:h-9 @3xl/root:px-3.5
          @3xl/root:has-[>svg]:px-3
        `,
      },
      variant: {
        default: `
          bg-white text-black
          hover:bg-white/90
        `,
        ghost: `
          text-white/85
          hover:bg-white/10 hover:text-white
        `,
        glass: `
          bg-white/10 text-white backdrop-blur-xl backdrop-saturate-150
          shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14)]
          hover:bg-white/20
          focus-visible:bg-white/15
        `,
        link: `
          text-white underline-offset-4
          hover:text-white/80
        `,
        outline: `
          border border-white/20 bg-black/40 text-white backdrop-blur-md
          hover:bg-white/10
        `,
        secondary: `
          bg-white/15 text-white backdrop-blur-md
          hover:bg-white/25
        `,
      },
    },
  }
)

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  render?: React.ReactElement
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { asChild = false, children, className, render, size, variant, ...props },
    ref
  ) => {
    const Comp = render ? Slot : asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ className, size, variant }))}
        data-slot="button"
        ref={ref}
        {...props}
      >
        {render ? React.cloneElement(render, undefined, children) : children}
      </Comp>
    )
  }
)

Button.displayName = "Button"

export { Button, buttonVariants }
