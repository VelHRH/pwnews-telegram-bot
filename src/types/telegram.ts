import { Context as TelegrafContext } from 'telegraf';

export interface Context extends TelegrafContext {
    session?: any;
}

export interface PendingPublication {
    text: string;
    url: string;
    videoUrl: string;
    videoImageUrl: string;
    inlineKeyboard: {
        inline_keyboard: Array<
            Array<{
                text: string;
                url: string;
            }>
        >;
    };
}

export interface PendingPPVPublication {
    cleanedText: string;
    articleUrl: string;
    videoUrl: string;
    imageUrl: string;
    inlineKeyboard: {
        inline_keyboard: Array<
            Array<{
                text: string;
                url: string;
            }>
        >;
    };
}

export interface PendingReview {
    text: string;
    imageUrl: string;
    url: string;
    inlineKeyboard: {
        inline_keyboard: Array<
            Array<{
                text: string;
                url: string;
            }>
        >;
    };
}

export interface PendingOtherNews {
    step: 'waiting_url' | 'waiting_button_text' | 'ready_to_publish';
    url?: string;
    title?: string;
    description?: string;
    imageUrl?: string;
    buttonText?: string;
}
