/**
 * The two sentences a customer reads when the engine is not certain.
 *
 * They were copied into four files, so a rewording was a four file change and the copies could
 * drift. They live here because the escalation reason never changes which sentence is said:
 * ADR 0012 made the reason audit metadata rather than a branch.
 *
 * Neither one says a person is taking over. ADR 0021: Dante talks like the counter, and the
 * counter does not announce that it has stopped being a bot. Both still promise an answer,
 * because ADR 0011 makes this the last thing Dante says in that conversation, and a customer
 * who is told nothing waits for a reply that never comes.
 *
 * The writer paraphrases these rather than copying them, so `WRITING_SYSTEM` forbids the words
 * this file avoids. Removing them here and not there puts them back in the model's voice.
 */
export const DELEGATE = 'eso lo confirmo con el local y te contestamos en un rato'

export const OUT_OF_CATALOG = 'eso no lo tengo a mano, lo confirmo con el local y te contestamos en un rato'
