type Row = Record<string, unknown>;
type TableReader = (table: string) => Row[];

function imageUrlReferencesPath(value: unknown, path: string): boolean {
  if (typeof value !== 'string') return false;
  const encoded = value.match(/[?&]p=([^&]+)/)?.[1];
  if (!encoded) return false;
  try {
    return decodeURIComponent(encoded) === path;
  } catch {
    return false;
  }
}

export function createImageAccessPolicy(getRows: TableReader) {
  const isChatParticipant = (chatId: string, userId: string): boolean => {
    const chat = getRows('chats').find(row => String(row.id) === chatId);
    return Boolean(chat &&
      (String(chat.user1_id) === userId || String(chat.user2_id) === userId));
  };

  const canUpload = (path: string, userId: string): boolean => {
    const parts = path.split('/');
    if (parts[0] === 'profile-photos') {
      return parts.length === 2 && parts[1] === userId;
    }
    const [chatId, ownerId] = parts;
    return parts.length >= 3 && ownerId === userId && isChatParticipant(chatId, userId);
  };

  const canRead = (path: string, userId: string): boolean => {
    const [namespace] = path.split('/');
    if (namespace === 'profile-photos') return true;
    return Boolean(namespace && isChatParticipant(namespace, userId));
  };

  const canRemove = (path: string, userId: string): boolean => {
    const parts = path.split('/');
    if (parts[0] === 'profile-photos') {
      return parts.length === 2 && parts[1] === userId;
    }

    const [chatId, ownerId] = parts;
    if (!chatId || !isChatParticipant(chatId, userId)) return false;
    if (parts.length >= 3) return ownerId === userId;

    // 이전 버전 경로(chatId/file)는 자신이 보낸 메시지에 연결된 경우만 허용합니다.
    return getRows('messages').some(message =>
      String(message.chat_id) === chatId &&
      String(message.sender_id) === userId &&
      imageUrlReferencesPath(message.image_url, path)
    );
  };

  return { canUpload, canRead, canRemove };
}
