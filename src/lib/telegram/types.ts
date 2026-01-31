/**
 * Telegram Bot API Types
 * Subset of types needed for CentaurOS integration
 */

export interface TelegramUser {
    id: number
    is_bot: boolean
    first_name: string
    last_name?: string
    username?: string
    language_code?: string
}

export interface TelegramChat {
    id: number
    type: 'private' | 'group' | 'supergroup' | 'channel'
    title?: string
    username?: string
    first_name?: string
    last_name?: string
}

export interface TelegramVoice {
    file_id: string
    file_unique_id: string
    duration: number
    mime_type?: string
    file_size?: number
}

export interface TelegramAudio {
    file_id: string
    file_unique_id: string
    duration: number
    performer?: string
    title?: string
    file_name?: string
    mime_type?: string
    file_size?: number
}

export interface TelegramMessage {
    message_id: number
    from?: TelegramUser
    chat: TelegramChat
    date: number
    text?: string
    voice?: TelegramVoice
    audio?: TelegramAudio
    caption?: string
}

export interface TelegramCallbackQuery {
    id: string
    from: TelegramUser
    message?: TelegramMessage
    chat_instance: string
    data?: string
}

export interface TelegramUpdate {
    update_id: number
    message?: TelegramMessage
    callback_query?: TelegramCallbackQuery
}

export interface InlineKeyboardButton {
    text: string
    callback_data?: string
    url?: string
}

export interface InlineKeyboardMarkup {
    inline_keyboard: InlineKeyboardButton[][]
}

export interface SendMessageOptions {
    chat_id: number | string
    text: string
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2'
    reply_markup?: InlineKeyboardMarkup
    reply_to_message_id?: number
}

export interface EditMessageOptions {
    chat_id: number | string
    message_id: number
    text: string
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2'
    reply_markup?: InlineKeyboardMarkup
}

export interface TelegramFile {
    file_id: string
    file_unique_id: string
    file_size?: number
    file_path?: string
}

// Parsed objective structure for confirmation flow
export interface ParsedObjective {
    title: string
    description: string
    tasks: Array<{
        title: string
        description?: string
        duration_days: number
        risk_level: 'Low' | 'Medium' | 'High'
        depends_on?: number[]
    }>
}

// Intent status in database
export type IntentStatus = 'pending' | 'confirmed' | 'rejected' | 'expired' | 'editing'
