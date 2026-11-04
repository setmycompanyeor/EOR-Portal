"use client";

import { useTransition } from "react";
import { completeClientTask } from "@/app/app/actions";

export function CompleteTaskButton({ taskId, employeeId }: { taskId: string; employeeId: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn btn-sm btn-primary" disabled={pending} onClick={() => start(() => completeClientTask(taskId, employeeId))}>
      {pending ? "Saving…" : "Mark done"}
    </button>
  );
}
