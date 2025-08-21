import * as React from "react";

import { cn } from "@/lib/utils";

function ScrollArea({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="scroll-area"
      className={cn("max-h-[260px] overflow-auto scrollbar-thin scrollbar-thumb-rounded-md", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { ScrollArea };
