import { GripVertical } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const ResizablePanelGroup = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex h-full w-full", className)} {...props} />
);

const ResizablePanel = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("min-w-0 flex-1", className)} {...props} />
);

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  withHandle?: boolean;
}) => (
  <div className={cn("relative flex w-px items-center justify-center bg-border", className)} {...props}>
    {withHandle && (
      <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-border">
        <GripVertical className="h-2.5 w-2.5" />
      </div>
    )}
  </div>
);
         
export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
