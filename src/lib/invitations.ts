import { getServer } from "./localStorage";

export interface Invitation {
  id: string;
  server_id: string;
  code: string;
  created_at: string;
  expires_at: string;
}

// Generate a random invitation code
const generateCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const createInvitation = (serverId: string): Invitation => {
  const invitation: Invitation = {
    id: crypto.randomUUID(),
    server_id: serverId,
    code: generateCode(),
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
  };

  const invitations = getInvitations();
  invitations.push(invitation);
  localStorage.setItem('invitations', JSON.stringify(invitations));

  return invitation;
};

export const getInvitations = (): Invitation[] => {
  const stored = localStorage.getItem('invitations');
  if (!stored) return [];
  
  const invitations = JSON.parse(stored) as Invitation[];
  // Filter out expired invitations
  const now = new Date().toISOString();
  return invitations.filter(inv => inv.expires_at > now);
};

export const getInvitationByCode = (code: string): Invitation | null => {
  const invitations = getInvitations();
  return invitations.find(inv => inv.code === code) || null;
};

export const deleteInvitation = (id: string) => {
  const invitations = getInvitations();
  const filtered = invitations.filter(inv => inv.id !== id);
  localStorage.setItem('invitations', JSON.stringify(filtered));
};

export const getInvitationLink = (code: string): string => {
  return `${window.location.origin}?invite=${code}`;
};

export const joinServerByInvite = (code: string): { success: boolean; serverId?: string; error?: string } => {
  const invitation = getInvitationByCode(code);
  
  if (!invitation) {
    return { success: false, error: "Invitation invalide ou expirée" };
  }

  const server = getServer(invitation.server_id);
  if (!server) {
    return { success: false, error: "Serveur introuvable" };
  }

  // Store joined servers
  const joinedServers = JSON.parse(localStorage.getItem('joinedServers') || '[]');
  if (!joinedServers.includes(invitation.server_id)) {
    joinedServers.push(invitation.server_id);
    localStorage.setItem('joinedServers', JSON.stringify(joinedServers));
  }

  return { success: true, serverId: invitation.server_id };
};
