import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase/config";

// Must match userDepartments() in firestore.rules.
export const DEPARTMENTS = ["Content", "Production", "Post Production", "Sales", "HR", "Tech"];
export const COMPANY_ROLES = ["CEO", "COO", "HR", "LEAD"];

export function taskScope(profile) {
  if (!profile) return "LOADING";
  if (COMPANY_ROLES.includes(profile.role)) return "COMPANY";
  return profile.role === "MANAGER" ? "DEPARTMENT" : "SELF";
}

// Role-scoped realtime tasks. Each query matches firestore.rules exactly
// (rules are not filters — a broader query is rejected as a whole).
// Use this in Tasks, Calendar, Dashboard… instead of reading the whole collection.
export function useScopedTasks(uid, profile) {
  const scope = taskScope(profile);
  const dept = typeof profile?.department === "string" ? profile.department : "";
  const [state, setState] = useState({ tasks: [], loading: true, error: "" });

  useEffect(() => {
    if (!uid || scope === "LOADING") return undefined;
    if (scope === "DEPARTMENT" && !dept) return setState({ tasks: [], loading: false, error: "" });
    setState((s) => ({ ...s, loading: true, error: "" }));
    const col = collection(db, "tasks");
    const q =
      scope === "COMPANY" ? col
        : scope === "DEPARTMENT" ? query(col, where("department", "==", dept))
          : query(col, where("assignedTo", "==", uid));
    return onSnapshot(
      q,
      (snap) => setState({
        tasks: snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.archived !== true),
        loading: false,
        error: "",
      }),
      (e) => {
        console.error("Tasks listener error:", e);
        setState({
          tasks: [],
          loading: false,
          error: e?.code === "permission-denied" ? "You do not have permission to view these tasks." : e?.message || "Unable to load tasks.",
        });
      }
    );
  }, [uid, scope, dept]);

  return { ...state, scope, dept };
}

// Calendar feed: each task gives an internal due-date event and a client-delivery event.
// Dates are "YYYY-MM-DD" strings.
export function taskCalendarEvents(tasks) {
  return tasks.flatMap((t) => {
    const base = { taskId: t.id, client: t.clientName || "", assignee: t.assignedToName || "", status: t.status, department: t.department || "" };
    return [
      t.dueDate && { ...base, id: `${t.id}-due`, date: t.dueDate, type: "TASK_DUE", title: `Task due · ${t.title}` },
      t.clientDueDate && { ...base, id: `${t.id}-client`, date: t.clientDueDate, type: "CLIENT_DELIVERY", title: `Client delivery · ${t.title}` },
    ].filter(Boolean);
  });
}