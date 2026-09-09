import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";

import { db } from "../firebase/config";

const tasksCollection = collection(db, "tasks");

export async function getTasksForUser(userId) {
  const q = query(
    tasksCollection,
    where("assignedTo", "==", userId)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  }));
}

export async function getAllTasks() {
  const snapshot = await getDocs(tasksCollection);

  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  }));
}

export async function createTask(taskData, createdBy) {
  const task = {
    title: taskData.title.trim(),
    description: taskData.description?.trim() || "",
    assignedTo: taskData.assignedTo,
    assignedToName: taskData.assignedToName || "",
    clientId: taskData.clientId || null,
    clientName: taskData.clientName || "",
    deliverableId: taskData.deliverableId || null,
    priority: taskData.priority || "MEDIUM",
    status: taskData.status || "TODO",
    dueDate: taskData.dueDate || null,

    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),

    archived: false,
  };

  const docRef = await addDoc(tasksCollection, task);

  return {
    id: docRef.id,
    ...task,
  };
}

export async function updateTask(taskId, updates) {
  const taskRef = doc(db, "tasks", taskId);

  await updateDoc(taskRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function archiveTask(taskId) {
  const taskRef = doc(db, "tasks", taskId);

  await updateDoc(taskRef, {
    archived: true,
    updatedAt: serverTimestamp(),
  });
}