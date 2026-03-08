import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Group, useGroups } from "@/hooks/useGroups";
import { useGroupChat, GroupMessage } from "@/hooks/useGroupChat";
import { useAuth } from "@/contexts/AuthContext";
import { useSound } from "@/hooks/useSound";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useReactions } from "@/hooks/useReactions";
import { smartTimestamp, dateSeparator, shouldShowDateSeparator } from "@/lib/timeUtils";
import GroupMessageContextMenu from "@/components/chat/GroupMessageContextMenu";
import MessageContent from "@/components/chat/MessageContent";
import EmojiPicker from "@/components/chat/EmojiPicker";
import { ReactionPills, QuickReactionPicker } from "@/components/chat/ReactionPills";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowLeft, Send, Phone, Users, UserPlus, Loader2, Pencil, X, Reply } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import AddMemberDialog from "./AddMemberDialog";
import GroupMembersPanel from "./GroupMembersPanel";

interface GroupChatPanelProps {
  group: Group;
  onClose: () => void;
  onStartCall: () => void;
}

const GroupChatPanel = ({ group, onClose, onStartCall }: GroupChatPanelProps) => {
  const { user } = useAuth();
  const { messages, loading, sendMessage } = useGroupChat(group.id);
  const { getGroupMembers } = useGroups();
  const { playMessageSent } = useSound();
  const channelId = `group-${group.id}`;
  const { isTyping, typingUsers, startTyping, stopTyping } = useTypingIndicator(channelId);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<GroupMessage | null>(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [members, setMembers] = useState<{ user_id: string }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isNearBottomRef = useRef(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);
  const { toggleReaction, getReactionGroups } = useReactions("group", messageIds);

  const messageMap = useMemo(() => {
    const map: Record<string, GroupMessage> = {};
    messages.forEach((m) => { map[m.id] = m; });
    return map;
  }, [messages]);

  // Smart scroll: only auto-scroll if user is near bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping]);

  // Track scroll position
  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (!viewport) return;
    const handleScroll = () => {
      const el = viewport as HTMLElement;
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      isNearBottomRef.current = distFromBottom < 100;
    };
    viewport.addEventListener('scroll', handleScroll);
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, [loading]);

  useEffect(() => { inputRef.current?.focus(); }, [group.id]);

  useEffect(() => {
    const loadMembers = async () => {
      const membersList = await getGroupMembers(group.id);
      setMembers(membersList);
    };
    loadMembers();
  }, [group.id, getGroupMembers]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    if (e.target.value.trim()) startTyping();
  };

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    stopTyping();
    setSending(true);
    const success = await sendMessage(input, replyTo?.id);
    if (success) {
      playMessageSent();
      setInput("");
      setReplyTo(null);
    }
    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setInput((prev) => prev + emoji);
    inputRef.current?.focus();
  };

  const handleReply = useCallback((msg: GroupMessage) => {
    setReplyTo(msg);
    inputRef.current?.focus();
  }, []);

  const isOwnerOrAdmin = group.owner_id === user?.id;

  return (
    <div className="flex-1 flex h-full">
      <div className="flex-1 flex flex-col h-full bg-background">
        {/* ─── Header ─── */}
        <header className="h-16 px-4 flex items-center gap-3 border-b border-white/[0.06] bg-card/30 backdrop-blur-xl shrink-0">
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-white/[0.06] md:hidden" silent>
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <Avatar className="h-9 w-9 shrink-0">
            <AvatarImage src={group.avatar_url || ""} className="object-cover" />
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
              {group.name[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold truncate">{group.name}</h3>
            <div className="h-4">
              {isTyping ? (
                <p className="text-[11px] text-primary flex items-center gap-1">
                  <span className="flex gap-0.5">
                    <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                  </span>
                  {typingUsers.join(", ")} écri{typingUsers.length > 1 ? "vent" : "t"}…
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground/40">
                  {members.length} membre{members.length > 1 ? "s" : ""}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-1">
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => setMembersOpen((p) => !p)}
                className={cn("h-8 w-8 rounded-lg", membersOpen ? "bg-primary/10 text-primary" : "hover:bg-white/[0.06]")}>
                <Users className="h-4 w-4" />
              </Button>
            </TooltipTrigger><TooltipContent>Membres</TooltipContent></Tooltip>
            {isOwnerOrAdmin && (
              <Tooltip><TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setAddMemberOpen(true)} className="h-8 w-8 rounded-lg hover:bg-white/[0.06]">
                  <UserPlus className="h-4 w-4" />
                </Button>
              </TooltipTrigger><TooltipContent>Inviter</TooltipContent></Tooltip>
            )}
            <Tooltip><TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onStartCall} className="h-8 w-8 rounded-lg hover:bg-success/10 hover:text-success">
                <Phone className="h-4 w-4" />
              </Button>
            </TooltipTrigger><TooltipContent>Appel vocal</TooltipContent></Tooltip>
          </div>
        </header>

        <AddMemberDialog open={addMemberOpen} onOpenChange={setAddMemberOpen} groupId={group.id} existingMemberIds={members.map((m) => m.user_id)} />

        {/* ─── Messages ─── */}
        <ScrollArea className="flex-1 px-4 py-4" ref={scrollAreaRef}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-20">
              <div className="w-16 h-16 mb-4 rounded-2xl bg-primary/5 border border-white/[0.04] flex items-center justify-center">
                <Users className="h-7 w-7 text-muted-foreground/20" />
              </div>
              <h4 className="font-semibold text-base mb-1">{group.name}</h4>
              <p className="text-muted-foreground/40 text-sm">Commencez la conversation !</p>
            </div>
          ) : (
            <div className="space-y-1">
              {messages.map((msg, idx) => {
                const isOwn = msg.sender_id === user?.id;
                const prevMsg = messages[idx - 1];
                const nextMsg = messages[idx + 1];
                const showDateSep = shouldShowDateSeparator(msg.created_at, prevMsg?.created_at);
                const isGStart = !prevMsg || prevMsg.sender_id !== msg.sender_id || showDateSep;
                const isGEnd = !nextMsg || nextMsg.sender_id !== msg.sender_id;
                const isEdited = !!msg.edited_at;
                const replyMsg = msg.reply_to_id ? messageMap[msg.reply_to_id] : null;
                const reactionGroups = getReactionGroups(msg.id);

                return (
                  <div key={msg.id}>
                    {showDateSep && (
                      <div className="flex items-center gap-4 my-6">
                        <div className="flex-1 h-px bg-white/[0.06]" />
                        <span className="text-[10px] text-muted-foreground/40 font-semibold uppercase tracking-wider px-2">
                          {dateSeparator(msg.created_at)}
                        </span>
                        <div className="flex-1 h-px bg-white/[0.06]" />
                      </div>
                    )}

                    {/* Group-style message (Discord-like for others, bubble for own) */}
                    {isOwn ? (
                      /* ─── Own messages: right-aligned bubble ─── */
                      <div className={cn("flex justify-end group/msg relative", isGStart ? "mt-3" : "mt-0.5")}>
                        <GroupMessageContextMenu message={msg} onReply={handleReply}>
                          <div className="max-w-[70%]">
                            {replyMsg && (
                              <div className="flex items-center gap-1.5 mb-1 px-2.5 py-1 rounded-lg bg-white/[0.03] border-l-2 border-primary/30 text-[11px] text-muted-foreground/50 truncate ml-auto max-w-[90%]">
                                <Reply className="h-3 w-3 shrink-0 text-primary/40" />
                                <span className="truncate">
                                  {replyMsg.sender_id === user?.id ? "Toi" : replyMsg.sender?.username}: {replyMsg.content}
                                </span>
                              </div>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className={cn(
                                  "px-3.5 py-2 message-own transition-all cursor-default",
                                  isGStart && isGEnd && "rounded-2xl",
                                  isGStart && !isGEnd && "rounded-2xl rounded-br-md",
                                  !isGStart && isGEnd && "rounded-2xl rounded-tr-md",
                                  !isGStart && !isGEnd && "rounded-lg rounded-r-md"
                                )}>
                                  <p className="text-[13.5px] leading-relaxed break-words">
                                    <MessageContent content={msg.content} />
                                  </p>
                                  {isGEnd && (
                                    <div className="flex items-center gap-1 mt-0.5 justify-end">
                                      {isEdited && <Pencil className="h-2.5 w-2.5 text-foreground/15" />}
                                      <span className="text-[10px] text-foreground/25">{smartTimestamp(msg.created_at)}</span>
                                    </div>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs">
                                {format(new Date(msg.created_at), "EEEE d MMMM yyyy à HH:mm", { locale: fr })}
                                {isEdited && " (modifié)"}
                              </TooltipContent>
                            </Tooltip>
                            <ReactionPills reactions={reactionGroups} onToggle={(emoji) => toggleReaction(msg.id, emoji)} isOwn={true} />
                          </div>
                        </GroupMessageContextMenu>
                        <QuickReactionPicker onSelect={(emoji) => toggleReaction(msg.id, emoji)} side="left" />
                      </div>
                    ) : (
                      /* ─── Others' messages: left-aligned with avatar + name (Discord-style) ─── */
                      <div className={cn("flex items-start gap-2.5 group/msg relative", isGStart ? "mt-3" : "mt-0.5")}>
                        {isGStart ? (
                          <Avatar className="h-8 w-8 shrink-0 mt-0.5 ring-2 ring-background">
                            <AvatarImage src={msg.sender?.avatar_url || ""} className="object-cover" />
                            <AvatarFallback className="text-[11px] bg-muted/50 font-bold">
                              {msg.sender?.username?.[0]?.toUpperCase() || "?"}
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <div className="w-8 shrink-0" />
                        )}

                        <GroupMessageContextMenu message={msg} onReply={handleReply}>
                          <div className="max-w-[70%]">
                            {isGStart && (
                              <div className="flex items-baseline gap-2 mb-0.5">
                                <span className="text-[12px] font-semibold text-foreground/70">
                                  {msg.sender?.username}
                                </span>
                                <span className="text-[10px] text-muted-foreground/30">
                                  {smartTimestamp(msg.created_at)}
                                </span>
                              </div>
                            )}

                            {replyMsg && (
                              <div className="flex items-center gap-1.5 mb-1 px-2.5 py-1 rounded-lg bg-white/[0.03] border-l-2 border-primary/30 text-[11px] text-muted-foreground/50 truncate max-w-[90%]">
                                <Reply className="h-3 w-3 shrink-0 text-primary/40" />
                                <span className="truncate">
                                  {replyMsg.sender_id === user?.id ? "Toi" : replyMsg.sender?.username}: {replyMsg.content}
                                </span>
                              </div>
                            )}

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className={cn(
                                  "px-3.5 py-2 message-other transition-all cursor-default",
                                  isGStart && isGEnd && "rounded-2xl",
                                  isGStart && !isGEnd && "rounded-2xl rounded-bl-md",
                                  !isGStart && isGEnd && "rounded-2xl rounded-tl-md",
                                  !isGStart && !isGEnd && "rounded-lg rounded-l-md"
                                )}>
                                  <p className="text-[13.5px] leading-relaxed break-words">
                                    <MessageContent content={msg.content} />
                                  </p>
                                  {isGEnd && !isGStart && (
                                    <div className="flex items-center gap-1 mt-0.5">
                                      {isEdited && <Pencil className="h-2.5 w-2.5 text-foreground/15" />}
                                      <span className="text-[10px] text-foreground/25">{smartTimestamp(msg.created_at)}</span>
                                    </div>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="text-xs">
                                {format(new Date(msg.created_at), "EEEE d MMMM yyyy à HH:mm", { locale: fr })}
                                {isEdited && " (modifié)"}
                              </TooltipContent>
                            </Tooltip>
                            <ReactionPills reactions={reactionGroups} onToggle={(emoji) => toggleReaction(msg.id, emoji)} isOwn={false} />
                          </div>
                        </GroupMessageContextMenu>
                        <QuickReactionPicker onSelect={(emoji) => toggleReaction(msg.id, emoji)} side="right" />
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>

        {/* ─── Typing indicator ─── */}
        {isTyping && (
          <div className="px-4 py-1.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground/40">
              <span className="flex gap-0.5">
                <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
              </span>
              <span>{typingUsers.join(", ")} écri{typingUsers.length > 1 ? "vent" : "t"}…</span>
            </div>
          </div>
        )}

        {/* ─── Reply preview bar ─── */}
        {replyTo && (
          <div className="px-4 py-2 border-t border-white/[0.04] bg-card/20 flex items-center gap-2 animate-fade-in">
            <Reply className="h-4 w-4 text-primary/60 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-primary/60 font-medium">
                Réponse à {replyTo.sender_id === user?.id ? "toi" : replyTo.sender?.username}
              </p>
              <p className="text-xs text-muted-foreground/50 truncate">{replyTo.content}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md hover:bg-white/[0.06]" onClick={() => setReplyTo(null)} silent>
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}




        {/* ─── Input ─── */}
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="px-4 py-3 border-t border-white/[0.06] bg-card/20">
          <div className="flex gap-2 items-center">
            <EmojiPicker onSelect={handleEmojiSelect} />
            <Input
              ref={inputRef}
              placeholder={replyTo ? "Écrire une réponse…" : `Message #${group.name}`}
              value={input}
              onChange={handleInputChange}
              onBlur={stopTyping}
              onKeyDown={handleKeyDown}
              className="flex-1 h-10 text-sm input-modern rounded-lg px-3"
              disabled={sending}
            />
            <Button type="submit" size="icon" disabled={!input.trim() || sending} className="h-10 w-10 rounded-lg btn-premium shrink-0">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </form>
      </div>

      {/* Members Panel */}
      {membersOpen && (
        <GroupMembersPanel
          groupId={group.id}
          isOwner={isOwnerOrAdmin}
          onAddMember={() => setAddMemberOpen(true)}
          onClose={() => setMembersOpen(false)}
        />
      )}
    </div>
  );
};

export default GroupChatPanel;
