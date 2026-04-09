import { collection, doc, CollectionReference, DocumentReference } from "firebase/firestore";
import { db } from "./firebase";

export function inventoryCol(uid: string): CollectionReference {
  return collection(db, "inventory", uid, "cards");
}

export function inventoryDoc(uid: string, printId: string): DocumentReference {
  return doc(db, "inventory", uid, "cards", printId);
}

export function printsDoc(printId: string): DocumentReference {
  return doc(db, "prints", printId);
}

export function pricesDoc(printId: string): DocumentReference {
  return doc(db, "prices", printId);
}

export function decksCol(uid: string): CollectionReference {
  return collection(db, "decks", uid, "lists");
}

export function deckDoc(uid: string, deckId: string): DocumentReference {
  return doc(db, "decks", uid, "lists", deckId);
}

export function summaryDoc(uid: string): DocumentReference {
  return doc(db, "collectionSummary", uid);
}
