import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "../firebase/config";

const deliverablesCollection = collection(db, "deliverables");

export async function getDeliverables() {
  const snapshot = await getDocs(deliverablesCollection);

  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  }));
}

export async function createDeliverable(deliverableData, createdBy) {
  const deliverable = {
    clientId: deliverableData.clientId || "",
    clientName: deliverableData.clientName || "",

    title: deliverableData.title.trim(),
    type: deliverableData.type || "REEL",

    assignedTo: deliverableData.assignedTo || "",
    assignedToName: deliverableData.assignedToName || "",

    status: deliverableData.status || "CONTENT",
    priority: deliverableData.priority || "MEDIUM",

    deadline: deliverableData.deadline || null,

    shootDate: deliverableData.shootDate || null,
    shootTime: deliverableData.shootTime || "",
    shootLocation: deliverableData.shootLocation?.trim() || "",

    notes: deliverableData.notes?.trim() || "",

    brief: {
      script: deliverableData.brief?.script?.trim() || "",
      shootPlan: deliverableData.brief?.shootPlan?.trim() || "",
      editNotes: deliverableData.brief?.editNotes?.trim() || "",
      caption: deliverableData.brief?.caption?.trim() || "",
    },

    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),

    archived: false,
  };

  const docRef = await addDoc(deliverablesCollection, deliverable);

  return {
    id: docRef.id,
    ...deliverable,
  };
}

export async function updateDeliverable(deliverableId, updates) {
  const deliverableRef = doc(db, "deliverables", deliverableId);

  await updateDoc(deliverableRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function updateDeliverableStage(
  deliverableId,
  status
) {
  const deliverableRef = doc(db, "deliverables", deliverableId);

  await updateDoc(deliverableRef, {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function archiveDeliverable(deliverableId) {
  const deliverableRef = doc(
    db,
    "deliverables",
    deliverableId
  );

  await updateDoc(deliverableRef, {
    archived: true,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteDeliverable(deliverableId) {
  const deliverableRef = doc(
    db,
    "deliverables",
    deliverableId
  );

  await deleteDoc(deliverableRef);
}