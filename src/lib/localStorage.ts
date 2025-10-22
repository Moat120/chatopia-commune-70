// Local storage service for Discord-like app
export interface User {
  id: string;
  username: string;
  avatar_url?: string;
  status?: string;
}

export interface Server {
  id: string;
  name: string;
  icon_url?: string;
  owner_id: string;
  created_at: string;
}

export interface Channel {
  id: string;
  server_id: string;
  name: string;
  type: 'text' | 'voice';
  created_at: string;
}

export interface Message {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

// Initialize default data
const initializeData = () => {
  const currentUser = localStorage.getItem('currentUser');
  if (!currentUser) {
    const defaultUser: User = {
      id: crypto.randomUUID(),
      username: `User${Math.floor(Math.random() * 10000)}`,
      status: 'En ligne'
    };
    localStorage.setItem('currentUser', JSON.stringify(defaultUser));
  }

  const servers = localStorage.getItem('servers');
  if (!servers) {
    const defaultServer: Server = {
      id: crypto.randomUUID(),
      name: 'Mon Serveur',
      owner_id: JSON.parse(localStorage.getItem('currentUser')!).id,
      created_at: new Date().toISOString()
    };
    localStorage.setItem('servers', JSON.stringify([defaultServer]));

    const defaultChannels: Channel[] = [
      {
        id: crypto.randomUUID(),
        server_id: defaultServer.id,
        name: 'général',
        type: 'text',
        created_at: new Date().toISOString()
      },
      {
        id: crypto.randomUUID(),
        server_id: defaultServer.id,
        name: 'vocal',
        type: 'voice',
        created_at: new Date().toISOString()
      }
    ];
    localStorage.setItem('channels', JSON.stringify(defaultChannels));
  }

  const messages = localStorage.getItem('messages');
  if (!messages) {
    localStorage.setItem('messages', JSON.stringify([]));
  }
};

// User operations
export const getCurrentUser = (): User => {
  initializeData();
  return JSON.parse(localStorage.getItem('currentUser')!);
};

export const updateCurrentUser = (updates: Partial<User>) => {
  const user = getCurrentUser();
  const updated = { ...user, ...updates };
  localStorage.setItem('currentUser', JSON.stringify(updated));
  
  // Trigger storage event manually for same-window updates
  window.dispatchEvent(new StorageEvent('storage', {
    key: 'currentUser',
    newValue: JSON.stringify(updated),
    oldValue: JSON.stringify(user)
  }));
  
  return updated;
};

// Server operations
export const getServers = (): Server[] => {
  initializeData();
  return JSON.parse(localStorage.getItem('servers') || '[]');
};

export const addServer = (name: string, icon_url?: string): Server => {
  const user = getCurrentUser();
  const server: Server = {
    id: crypto.randomUUID(),
    name,
    icon_url,
    owner_id: user.id,
    created_at: new Date().toISOString()
  };
  const servers = getServers();
  servers.push(server);
  localStorage.setItem('servers', JSON.stringify(servers));
  return server;
};

export const getServer = (id: string): Server | null => {
  const servers = getServers();
  return servers.find(s => s.id === id) || null;
};

// Channel operations
export const getChannels = (serverId: string): Channel[] => {
  initializeData();
  const channels = JSON.parse(localStorage.getItem('channels') || '[]');
  return channels.filter((c: Channel) => c.server_id === serverId);
};

export const addChannel = (serverId: string, name: string, type: 'text' | 'voice'): Channel => {
  const channel: Channel = {
    id: crypto.randomUUID(),
    server_id: serverId,
    name,
    type,
    created_at: new Date().toISOString()
  };
  const channels = JSON.parse(localStorage.getItem('channels') || '[]');
  channels.push(channel);
  localStorage.setItem('channels', JSON.stringify(channels));
  return channel;
};

export const getChannel = (id: string): Channel | null => {
  const channels = JSON.parse(localStorage.getItem('channels') || '[]');
  return channels.find((c: Channel) => c.id === id) || null;
};

// Message operations
export const getMessages = (channelId: string): (Message & { profiles: User })[] => {
  initializeData();
  const messages = JSON.parse(localStorage.getItem('messages') || '[]');
  const user = getCurrentUser();
  return messages
    .filter((m: Message) => m.channel_id === channelId)
    .map((m: Message) => ({
      ...m,
      profiles: user
    }));
};

export const addMessage = (channelId: string, content: string): Message => {
  const user = getCurrentUser();
  const message: Message = {
    id: crypto.randomUUID(),
    channel_id: channelId,
    user_id: user.id,
    content,
    created_at: new Date().toISOString()
  };
  const messages = JSON.parse(localStorage.getItem('messages') || '[]');
  messages.push(message);
  localStorage.setItem('messages', JSON.stringify(messages));
  
  // Trigger storage event for other components
  window.dispatchEvent(new StorageEvent('storage', {
    key: 'messages',
    newValue: JSON.stringify(messages)
  }));
  
  return message;
};
