import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  Timestamp,
  getDocFromServer
} from 'firebase/firestore';
import { db, auth } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

export async function getOrCreateUser(uid: string, email: string) {
  const userRef = doc(db, 'users', uid);
  try {
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) {
      const newUser = {
        uid,
        email,
        credits: 3, // Start with 3 free credits
        isSubscribed: false,
        createdAt: Timestamp.now()
      };
      await setDoc(userRef, newUser);
      return newUser;
    }
    return userDoc.data();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }
}

export async function deductCredit(uid: string) {
  const userRef = doc(db, 'users', uid);
  try {
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      const currentCredits = userDoc.data().credits;
      if (currentCredits > 0) {
        await updateDoc(userRef, { credits: currentCredits - 1 });
        return true;
      }
    }
    return false;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function saveImage(userId: string, prompt: string, imageUrl: string) {
  const imageId = `img_${Date.now()}`;
  const imageRef = doc(db, 'images', imageId);
  try {
    await setDoc(imageRef, {
      id: imageId,
      userId,
      prompt,
      imageUrl,
      createdAt: Timestamp.now()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `images/${imageId}`);
  }
}

export async function saveVideo(userId: string, prompt: string, videoId: string, sourceImageUrl?: string) {
  const videoRef = doc(db, 'videos', videoId);
  try {
    await setDoc(videoRef, {
      id: videoId,
      userId,
      prompt,
      status: 'pending',
      isPaid: false,
      createdAt: Timestamp.now(),
      ...(sourceImageUrl && { sourceImageUrl })
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `videos/${videoId}`);
  }
}

export async function updateVideoStatus(videoId: string, status: 'completed' | 'failed', videoUrl?: string) {
  const videoRef = doc(db, 'videos', videoId);
  try {
    await updateDoc(videoRef, {
      status,
      ...(videoUrl && { videoUrl })
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `videos/${videoId}`);
  }
}

export async function createPayment(userId: string, userEmail: string, amount: number, type: 'credits' | 'single_video', videoId?: string) {
  const paymentId = `pay_${Date.now()}`;
  const paymentRef = doc(db, 'payments', paymentId);
  try {
    await setDoc(paymentRef, {
      id: paymentId,
      userId,
      userEmail,
      amount,
      currency: 'ETB',
      type,
      status: 'pending',
      paymentMethod: 'Manual Transfer (Telebirr/CBE)',
      createdAt: Timestamp.now(),
      ...(videoId && { videoId })
    });
    return paymentId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `payments/${paymentId}`);
  }
}

export async function markVideoAsPaid(videoId: string) {
  const videoRef = doc(db, 'videos', videoId);
  try {
    await updateDoc(videoRef, { isPaid: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `videos/${videoId}`);
  }
}

export async function confirmPayment(paymentId: string, userId: string, type: string, amount: number, videoId?: string) {
  const paymentRef = doc(db, 'payments', paymentId);
  try {
    await updateDoc(paymentRef, { status: 'confirmed' });
    
    if (type === 'credits') {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const currentCredits = userDoc.data().credits || 0;
        const newCredits = Math.floor(amount / 15);
        await updateDoc(userRef, { credits: currentCredits + newCredits });
      }
    } else if (type === 'single_video' && videoId) {
      await markVideoAsPaid(videoId);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `payments/${paymentId}`);
  }
}

export function subscribeToVideos(userId: string, callback: (videos: any[]) => void) {
  const q = query(
    collection(db, 'videos'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const videos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(videos);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'videos');
  });
}

export function subscribeToImages(userId: string, callback: (images: any[]) => void) {
  const q = query(
    collection(db, 'images'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const images = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(images);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'images');
  });
}

export function subscribeToAllPayments(callback: (payments: any[]) => void) {
  const q = query(collection(db, 'payments'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const payments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(payments);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'payments');
  });
}

export function subscribeToUserPayments(userId: string, callback: (payments: any[]) => void) {
  const q = query(
    collection(db, 'payments'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snapshot) => {
    const payments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    callback(payments);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'payments');
  });
}

export function subscribeToUser(userId: string, callback: (user: any) => void) {
  return onSnapshot(doc(db, 'users', userId), (doc) => {
    callback(doc.data());
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, `users/${userId}`);
  });
}
