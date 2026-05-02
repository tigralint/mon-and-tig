import { getDB } from '../db/database';
import { AIService } from './ai.service';

export const FlashcardService = {
  // SM-2 Algorithm Implementation
  // easeFactor: 1.3 to 2.5
  // quality: 0 (Blackout) to 5 (Perfect)
  calculateNextReview(quality, oldEaseFactor, oldInterval, repetitions) {
    let newEaseFactor = oldEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (newEaseFactor < 1.3) newEaseFactor = 1.3;
    
    let newInterval = 1;
    let newRepetitions = repetitions;

    if (quality < 3) {
      newRepetitions = 0;
      newInterval = 1; // start over
    } else {
      newRepetitions += 1;
      if (newRepetitions === 1) {
        newInterval = 1;
      } else if (newRepetitions === 2) {
        newInterval = 6;
      } else {
        newInterval = Math.round(oldInterval * newEaseFactor);
      }
    }

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + newInterval);

    return { newEaseFactor, newInterval, newRepetitions, nextReview: nextReview.toISOString() };
  },

  async createCard(documentId, front, back) {
    const db = await getDB();
    const card = {
      id: crypto.randomUUID(),
      documentId,
      front,
      back,
      easeFactor: 2.5,
      interval: 0,
      repetitions: 0,
      nextReview: new Date().toISOString(), // ready immediately
      createdAt: new Date().toISOString()
    };
    await db.put('flashcards', card);
    return card;
  },

  async getCardsForReview() {
    const db = await getDB();
    const allCards = await db.getAll('flashcards');
    const now = new Date().toISOString();
    return allCards.filter(card => card.nextReview <= now);
  },

  async getAllCards() {
    const db = await getDB();
    return await db.getAll('flashcards');
  },

  async submitReview(cardId, quality) {
    const db = await getDB();
    const card = await db.get('flashcards', cardId);
    
    if (!card) throw new Error('Card not found');

    const { newEaseFactor, newInterval, newRepetitions, nextReview } = this.calculateNextReview(
      quality, 
      card.easeFactor, 
      card.interval, 
      card.repetitions
    );

    const updatedCard = {
      ...card,
      easeFactor: newEaseFactor,
      interval: newInterval,
      repetitions: newRepetitions,
      nextReview,
      lastReviewedAt: new Date().toISOString()
    };

    await db.put('flashcards', updatedCard);
    return updatedCard;
  },

  async generateFromDocument(documentId, textContent) {
    if (!textContent) throw new Error('No text provided');
    const aiCards = await AIService.generateFlashcards(textContent);
    
    const createdCards = [];
    for (const aiCard of aiCards) {
      if (aiCard.front && aiCard.back) {
        const card = await this.createCard(documentId, aiCard.front, aiCard.back);
        createdCards.push(card);
      }
    }
    return createdCards;
  },

  async generateFromImage(documentId, base64Image, mimeType) {
    if (!base64Image) throw new Error('No image provided');
    const aiCards = await AIService.generateFlashcardsFromImage(base64Image, mimeType);
    
    const createdCards = [];
    for (const aiCard of aiCards) {
      if (aiCard.front && aiCard.back) {
        // Если documentId === 'image-import', значит мы импортируем чисто в карточки без привязки к документу
        const card = await this.createCard(documentId || 'image-import', aiCard.front, aiCard.back);
        createdCards.push(card);
      }
    }
    return createdCards;
  }
};
