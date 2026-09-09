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
  writeBatch,
} from "firebase/firestore";

import { db } from "../firebase/config";

const clientsCollection = collection(db, "clients");
const deliverablesCollection = collection(db, "deliverables");

export async function getClients() {
  const snapshot = await getDocs(clientsCollection);

  return snapshot.docs.map((item) => ({
    id: item.id,
    ...item.data(),
  }));
}

export async function createClient(clientData, createdBy) {
  const client = {
    name: clientData.name.trim(),
    industry: clientData.industry?.trim() || "",
    contactName: clientData.contactName?.trim() || "",
    contactEmail: clientData.contactEmail?.trim() || "",
    phone: clientData.phone?.trim() || "",
    status: clientData.status || "ACTIVE",
    notes: clientData.notes?.trim() || "",

    createdBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(clientsCollection, client);

  return {
    id: docRef.id,
    ...client,
  };
}

export async function updateClient(clientId, updates) {
  const clientRef = doc(db, "clients", clientId);

  await updateDoc(clientRef, {
    name: updates.name.trim(),
    industry: updates.industry?.trim() || "",
    contactName: updates.contactName?.trim() || "",
    contactEmail: updates.contactEmail?.trim() || "",
    phone: updates.phone?.trim() || "",
    status: updates.status || "ACTIVE",
    notes: updates.notes?.trim() || "",
    updatedAt: serverTimestamp(),
  });
}

export async function archiveClient(clientId) {
  const clientRef = doc(db, "clients", clientId);

  await updateDoc(clientRef, {
    status: "ARCHIVED",
    updatedAt: serverTimestamp(),
  });
}

/**
 * Permanently deletes a client and archives all
 * active deliverables belonging to that client.
 *
 * Deliverables are NOT deleted so production history
 * is preserved.
 */
export async function deleteClient(clientId) {
  const clientRef = doc(db, "clients", clientId);

  // Find all deliverables connected to this client.
  const deliverablesQuery = query(
    deliverablesCollection,
    where("clientId", "==", clientId)
  );

  const deliverablesSnapshot = await getDocs(
    deliverablesQuery
  );

  const batch = writeBatch(db);

  // Archive every connected deliverable.
  deliverablesSnapshot.docs.forEach((deliverableDoc) => {
    batch.update(deliverableDoc.ref, {
      archived: true,
      updatedAt: serverTimestamp(),
    });
  });

  // Permanently delete the client itself.
  batch.delete(clientRef);

  // Execute everything together.
  await batch.commit();
}