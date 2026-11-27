/* =========================================================
   TELECLONE CENTRAL STATE STORE (BOT & BACKEND READY)
   ========================================================= */

(function () {
  const STORAGE_KEY = "teleclone_state_v1";

  const DEFAULT_STATE = {
    theme: "dark",
    activeAccountId: "acc_1",
    activeFolder: "all",
    activeChatId: null,
    viewingArchive: false,
    searchQuery: "",
    searchFilter: "all",

    // Dynamic UI Settings (Module 4 mein live controls connect honge)
    settings: {
      fontSize: 15,
      bubbleRadius: 14,
      accentColor: "#8774e1",
      sendByEnter: true,
      passcodeEnabled: false
    },

    // Multi-Account Support
    accounts: [
      {
        id: "acc_1",
        name: "Developer Account",
        username: "@dev_user",
        phone: "+92 300 1234567",
        initials: "DA",
        color: "linear-gradient(135deg, #667eea, #764ba2)",
        bio: "Building TeleClone & Bots"
      },
      {
        id: "acc_2",
        name: "Testing Account",
        username: "@test_acc",
        phone: "+92 311 7654321",
        initials: "TA",
        color: "linear-gradient(135deg, #11998e, #38ef7d)",
        bio: "Secondary test profile"
      }
    ],

    // Stories Bar Data
    stories: [
      { id: "st_1", name: "My Story", initials: "DA", color: "#54a9eb", isMine: true, seen: false },
      { id: "st_2", name: "BotFather", initials: "🤖", color: "#8774e1", isMine: false, seen: false },
      { id: "st_3", name: "Hamza", initials: "HA", color: "#e17055", isMine: false, seen: false },
      { id: "st_4", name: "Dev Hub", initials: "DH", color: "#00b894", isMine: false, seen: false },
      { id: "st_5", name: "Tech News", initials: "TN", color: "#0984e3", isMine: false, seen: true },
      { id: "st_6", name: "Bilal", initials: "BI", color: "#fdcb6e", isMine: false, seen: true }
    ],

    // Chat Folders
    folders: [
      { id: "all", label: "All" },
      { id: "personal", label: "Personal" },
      { id: "bots", label: "Bots" },
      { id: "groups", label: "Groups" },
      { id: "channels", label: "Channels" },
      { id: "unread", label: "Unread" }
    ],

    // Chats (Personal, Groups, Channels, Saved Messages & Bots)
    chats: [
      {
        id: "chat_botfather",
        type: "bot",
        name: "BotFather",
        username: "@BotFather",
        initials: "🤖",
        avatarColor: "linear-gradient(135deg, #3390ec, #6c5ce7)",
        verified: true,
        isBot: true,
        online: false,
        statusText: "bot",
        description: "Official system bot to create and manage new bots & API tokens.",
        botCommands: [
          { command: "/newbot", description: "Create a new bot" },
          { command: "/mybots", description: "Edit your bots & tokens" },
          { command: "/setcommands", description: "Change bot command list" },
          { command: "/help", description: "Show bot creation guide" }
        ],
        pinned: true,
        muted: false,
        archived: false,
        unreadCount: 1,
        lastMessage: "Send /newbot to create your first bot!",
        lastSender: "",
        lastTime: "7:30 PM",
        lastTimestamp: 1763821800000,
        messages: [
          {
            id: "m_bf_1",
            sender: "them",
            text: "Welcome to BotFather! I can help you create a new bot and API token. Send /newbot to get started.",
            time: "7:30 PM",
            status: "read"
          }
        ]
      },
      {
        id: "chat_saved",
        type: "saved",
        name: "Saved Messages",
        username: "@saved",
        initials: "🔖",
        avatarColor: "linear-gradient(135deg, #2b86c5, #4facfe)",
        verified: false,
        isBot: false,
        online: false,
        statusText: "Personal cloud storage",
        pinned: true,
        muted: false,
        archived: false,
        unreadCount: 0,
        lastMessage: "Project roadmap & API keys notes",
        lastSender: "",
        lastTime: "6:45 PM",
        lastTimestamp: 1763819100000,
        messages: [
          {
            id: "m_sv_1",
            sender: "me",
            text: "Project roadmap & API keys notes",
            time: "6:45 PM",
            status: "read"
          }
        ]
      },
      {
        id: "chat_hamza",
        type: "personal",
        name: "Hamza Khan",
        username: "@hamza_k",
        initials: "HK",
        avatarColor: "linear-gradient(135deg, #ff7675, #d63031)",
        verified: false,
        isBot: false,
        online: true,
        statusText: "online",
        pinned: false,
        muted: false,
        archived: false,
        unreadCount: 3,
        lastMessage: "Hey, how is the app coming along?",
        lastSender: "",
        lastTime: "7:15 PM",
        lastTimestamp: 1763820900000,
        messages: [
          {
            id: "m_hk_1",
            sender: "them",
            text: "Hey! How is the app coming along?",
            time: "7:15 PM",
            status: "read"
          }
        ]
      },
      {
        id: "chat_lobby_bot",
        type: "bot",
        name: "Media Lobby Bot",
        username: "@MediaLobbyBot",
        initials: "ML",
        avatarColor: "linear-gradient(135deg, #00b894, #00cec9)",
        verified: false,
        isBot: true,
        online: false,
        statusText: "bot",
        botToken: "7042918:AAH_demo_lobby_token_9821",
        description: "Broadcast media & manage active lobby members.",
        botCommands: [
          { command: "/start", description: "Join the media lobby" },
          { command: "/stats", description: "Check lobby status" },
          { command: "/broadcast", description: "Admin broadcast" }
        ],
        pinned: false,
        muted: false,
        archived: false,
        unreadCount: 0,
        lastMessage: "✅ Broadcast delivered to 48 members.",
        lastSender: "",
        lastTime: "5:20 PM",
        lastTimestamp: 1763814000000,
        messages: [
          {
            id: "m_lb_1",
            sender: "them",
            text: "✅ Broadcast delivered to 48 members.",
            time: "5:20 PM",
            status: "read"
          }
        ]
      },
      {
        id: "chat_dev_group",
        type: "group",
        name: "TeleClone Builders",
        username: "@teleclone_dev",
        initials: "TB",
        avatarColor: "linear-gradient(135deg, #f093fb, #f5576c)",
        verified: false,
        isBot: false,
        online: false,
        statusText: "14 members, 4 online",
        pinned: false,
        muted: false,
        archived: false,
        unreadCount: 5,
        lastMessage: "We are adding real-time WebSockets and webhook support.",
        lastSender: "Zain",
        lastTime: "4:10 PM",
        lastTimestamp: 1763809800000,
        messages: [
          {
            id: "m_dg_1",
            sender: "them",
            senderName: "Zain",
            text: "We are adding real-time WebSockets and webhook support.",
            time: "4:10 PM",
            status: "read"
          }
        ]
      },
      {
        id: "chat_channel_news",
        type: "channel",
        name: "TeleClone Updates",
        username: "@teleclone_news",
        initials: "📢",
        avatarColor: "linear-gradient(135deg, #4facfe, #00f2fe)",
        verified: true,
        isBot: false,
        online: false,
        statusText: "12.4K subscribers",
        pinned: false,
        muted: true,
        archived: false,
        unreadCount: 2,
        lastMessage: "🚀 v1.0 UI Core is live with Multi-Account & Bot support!",
        lastSender: "",
        lastTime: "Yesterday",
        lastTimestamp: 1763730000000,
        messages: [
          {
            id: "m_cn_1",
            sender: "them",
            text: "🚀 v1.0 UI Core is live with Multi-Account & Bot support!",
            time: "Yesterday",
            status: "read"
          }
        ]
      },
      {
        id: "chat_archived_promo",
        type: "channel",
        name: "Old Deals & Alerts",
        username: "@old_deals",
        initials: "OD",
        avatarColor: "linear-gradient(135deg, #636e72, #2d3436)",
        verified: false,
        isBot: false,
        online: false,
        statusText: "3.1K subscribers",
        pinned: false,
        muted: true,
        archived: true,
        unreadCount: 4,
        lastMessage: "Archived chat test — click back arrow to return.",
        lastSender: "",
        lastTime: "Mon",
        lastTimestamp: 1763500000000,
        messages: []
      }
    ]
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      return {
        ...structuredClone(DEFAULT_STATE),
        ...parsed,
        settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) }
      };
    } catch (err) {
      console.warn("Store load failed, resetting state:", err);
      return structuredClone(DEFAULT_STATE);
    }
  }

  let state = loadState();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn("Store save failed:", err);
    }
  }

  window.Store = {
    getState() {
      return state;
    },

    save,

    getActiveAccount() {
      return state.accounts.find((a) => a.id === state.activeAccountId) || state.accounts[0];
    },

    getChatById(chatId) {
      return state.chats.find((c) => c.id === chatId) || null;
    },

    setTheme(theme) {
      state.theme = theme;
      save();
    },

    switchAccount(accountId) {
      if (state.accounts.some((a) => a.id === accountId)) {
        state.activeAccountId = accountId;
        save();
      }
    },

    setFolder(folderId) {
      state.activeFolder = folderId;
      state.viewingArchive = false;
      save();
    },

    selectChat(chatId) {
      state.activeChatId = chatId;
      const chat = this.getChatById(chatId);
      if (chat) {
        chat.unreadCount = 0;
      }
      save();
    },

    togglePin(chatId) {
      const chat = this.getChatById(chatId);
      if (!chat) return false;
      chat.pinned = !chat.pinned;
      save();
      return chat.pinned;
    },

    toggleMute(chatId) {
      const chat = this.getChatById(chatId);
      if (!chat) return false;
      chat.muted = !chat.muted;
      save();
      return chat.muted;
    },

    toggleRead(chatId) {
      const chat = this.getChatById(chatId);
      if (!chat) return 0;
      chat.unreadCount = chat.unreadCount > 0 ? 0 : 1;
      save();
      return chat.unreadCount;
    },

    toggleArchive(chatId) {
      const chat = this.getChatById(chatId);
      if (!chat) return false;
      chat.archived = !chat.archived;
      if (chat.archived && state.activeChatId === chatId) {
        state.activeChatId = null;
      }
      save();
      return chat.archived;
    },

    deleteChat(chatId) {
      state.chats = state.chats.filter((c) => c.id !== chatId);
      if (state.activeChatId === chatId) {
        state.activeChatId = null;
      }
      save();
    },

    markStorySeen(storyId) {
      const story = state.stories.find((s) => s.id === storyId);
      if (story && !story.isMine) {
        story.seen = true;
        save();
      }
    },
// ==================== MODULE 2: MESSAGES & BOTS ====================
    formatTime(date = new Date()) {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    },

    addMessage(chatId, msgData) {
      const chat = this.getChatById(chatId);
      if (!chat) return null;
      if (!Array.isArray(chat.messages)) chat.messages = [];

      const now = new Date();
      const msg = {
        id: "m_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
        sender: msgData.sender || "me",
        senderName: msgData.senderName || "",
        text: msgData.text || "",
        time: msgData.time || this.formatTime(now),
        status: msgData.sender === "me" ? (msgData.silent ? "sent" : "read") : "read",
        silent: !!msgData.silent,
        edited: false,
        replyTo: msgData.replyTo || null,
        attachment: msgData.attachment || null,
        poll: msgData.poll || null,
        reactions: msgData.reactions || {},
        inlineKeyboard: msgData.inlineKeyboard || null
      };

      chat.messages.push(msg);

      // Chat list preview update
      const previewText =
        msg.text ||
        (msg.attachment ? `📎 ${msg.attachment.label || msg.attachment.name || "Media"}` : "") ||
        (msg.poll ? `📊 Poll: ${msg.poll.question}` : "Message");

      chat.lastMessage = previewText.replace(/\n/g, " ").slice(0, 70);
      chat.lastSender = msg.sender === "me" ? "You" : msg.senderName || "";
      chat.lastTime = msg.time;
      chat.lastTimestamp = now.getTime();

      if (state.activeChatId !== chatId && msg.sender !== "me") {
        chat.unreadCount = (chat.unreadCount || 0) + 1;
      }

      save();
      return msg;
    },

    editMessage(chatId, msgId, newText, newInlineKeyboard = undefined) {
      const chat = this.getChatById(chatId);
      if (!chat || !chat.messages) return null;
      const msg = chat.messages.find((m) => m.id === msgId);
      if (!msg) return null;

      if (typeof newText === "string") {
        msg.text = newText;
        msg.edited = true;
      }
      if (newInlineKeyboard !== undefined) {
        msg.inlineKeyboard = newInlineKeyboard;
      }

      const last = chat.messages[chat.messages.length - 1];
      if (last && last.id === msgId) {
        chat.lastMessage = msg.text.replace(/\n/g, " ").slice(0, 70);
      }

      save();
      return msg;
    },

    deleteMessage(chatId, msgId) {
      const chat = this.getChatById(chatId);
      if (!chat || !chat.messages) return;
      chat.messages = chat.messages.filter((m) => m.id !== msgId);

      if (chat.pinnedMessageId === msgId) {
        chat.pinnedMessageId = null;
      }

      const last = chat.messages[chat.messages.length - 1];
      chat.lastMessage = last ? (last.text || "Media").slice(0, 70) : "No messages";
      save();
    },

    toggleReaction(chatId, msgId, emoji) {
      const chat = this.getChatById(chatId);
      if (!chat || !chat.messages) return;
      const msg = chat.messages.find((m) => m.id === msgId);
      if (!msg) return;
      if (!msg.reactions) msg.reactions = {};

      const current = msg.reactions[emoji];
      if (current && current.mine) {
        current.count -= 1;
        current.mine = false;
        if (current.count <= 0) delete msg.reactions[emoji];
      } else if (current) {
        current.count += 1;
        current.mine = true;
      } else {
        msg.reactions[emoji] = { count: 1, mine: true };
      }
      save();
    },

    pinMessage(chatId, msgId) {
      const chat = this.getChatById(chatId);
      if (!chat) return;
      chat.pinnedMessageId = msgId;
      save();
    },

    votePoll(chatId, msgId, optionIndex) {
      const chat = this.getChatById(chatId);
      if (!chat || !chat.messages) return;
      const msg = chat.messages.find((m) => m.id === msgId);
      if (!msg || !msg.poll) return;

      const prev = msg.poll.myVote;
      if (prev !== null && prev !== undefined && msg.poll.options[prev]) {
        msg.poll.options[prev].votes = Math.max(0, msg.poll.options[prev].votes - 1);
      }
      if (prev === optionIndex) {
        msg.poll.myVote = null;
      } else {
        msg.poll.options[optionIndex].votes += 1;
        msg.poll.myVote = optionIndex;
      }
      save();
    },

    clearHistory(chatId) {
      const chat = this.getChatById(chatId);
      if (!chat) return;
      chat.messages = [];
      chat.pinnedMessageId = null;
      chat.lastMessage = "History cleared";
      chat.replyKeyboard = null;
      save();
    },

    setReplyKeyboard(chatId, keyboard) {
      const chat = this.getChatById(chatId);
      if (!chat) return;
      chat.replyKeyboard = keyboard;
      save();
    },

    markBotStarted(chatId) {
      const chat = this.getChatById(chatId);
      if (!chat) return;
      chat.botStarted = true;
      save();
    },

    createBotChat({ name, username, token }) {
      const cleanUser = username.startsWith("@") ? username : "@" + username;
      const initials = name
        .split(/\s+/)
        .map((w) => w[0] || "")
        .join("")
        .toUpperCase()
        .slice(0, 2) || "BT";

      const colors = [
        "linear-gradient(135deg, #6c5ce7, #a29bfe)",
        "linear-gradient(135deg, #00b894, #55efc4)",
        "linear-gradient(135deg, #0984e3, #74b9ff)",
        "linear-gradient(135deg, #e84393, #fd79a8)",
        "linear-gradient(135deg, #f39c12, #f1c40f)"
      ];
      const avatarColor = colors[state.chats.length % colors.length];

      const newBot = {
        id: "chat_bot_" + Date.now(),
        type: "bot",
        name,
        username: cleanUser,
        initials,
        avatarColor,
        verified: false,
        isBot: true,
        botStarted: false,
        botToken: token,
        online: false,
        statusText: "bot",
        description: `Custom bot created via @BotFather. Click START to test commands, inline buttons & Mini App.`,
        botCommands: [
          { command: "/start", description: "Start this bot" },
          { command: "/help", description: "Show available commands" },
          { command: "/status", description: "Check bot API status" }
        ],
        pinned: false,
        muted: false,
        archived: false,
        unreadCount: 0,
        lastMessage: "Tap START to launch your new bot",
        lastSender: "",
        lastTime: this.formatTime(),
        lastTimestamp: Date.now(),
        messages: []
      };

      state.chats.unshift(newBot);
      save();
      return newBot;
    },

    getUserBots() {
      return state.chats.filter((c) => c.isBot && c.id !== "chat_botfather");
    },

    updateBotToken(chatId, newToken) {
      const chat = this.getChatById(chatId);
      if (!chat) return;
      chat.botToken = newToken;
      save();
    },

    addBotCommand(chatId, command, description) {
      const chat = this.getChatById(chatId);
      if (!chat) return;
      if (!Array.isArray(chat.botCommands)) chat.botCommands = [];
      const cmd = command.startsWith("/") ? command : "/" + command;
      if (!chat.botCommands.some((c) => c.command === cmd)) {
        chat.botCommands.push({ command: cmd, description });
      }
      save();
    },
// ==================== MODULE 3: SOCIAL, GROUPS, CONTACTS & CALLS ====================
    ensureSocialData() {
      if (!Array.isArray(state.contacts)) {
        state.contacts = [
          { id: "ct_1", name: "Hamza Khan", username: "@hamza_k", phone: "+92 300 5511223", initials: "HK", color: "linear-gradient(135deg, #ff7675, #d63031)", chatId: "chat_hamza" },
          { id: "ct_2", name: "Zain Ahmed", username: "@zain_dev", phone: "+92 321 8844110", initials: "ZA", color: "linear-gradient(135deg, #6c5ce7, #a29bfe)" },
          { id: "ct_3", name: "Bilal Raza", username: "@bilal_r", phone: "+92 333 9021345", initials: "BR", color: "linear-gradient(135deg, #fdcb6e, #e17055)" },
          { id: "ct_4", name: "Sara Ali", username: "@sara_ui", phone: "+92 345 7712098", initials: "SA", color: "linear-gradient(135deg, #00b894, #00cec9)" }
        ];
      }
      if (!Array.isArray(state.calls)) {
        state.calls = [
          { id: "call_1", chatId: "chat_hamza", name: "Hamza Khan", initials: "HK", color: "linear-gradient(135deg, #ff7675, #d63031)", direction: "outgoing", duration: "2:14", time: "Today, 6:10 PM" },
          { id: "call_2", chatId: "chat_dev_group", name: "TeleClone Builders", initials: "TB", color: "linear-gradient(135deg, #f093fb, #f5576c)", direction: "incoming", duration: "11:45", time: "Yesterday" }
        ];
      }
      // Default group members agar pehle se set na hon
      const devGroup = this.getChatById("chat_dev_group");
      if (devGroup && !Array.isArray(devGroup.members)) {
        devGroup.members = [
          { id: "m_you", name: this.getActiveAccount().name, username: this.getActiveAccount().username, initials: this.getActiveAccount().initials, color: this.getActiveAccount().color, role: "Owner", isBot: false },
          { id: "ct_2", name: "Zain Ahmed", username: "@zain_dev", initials: "ZA", color: "linear-gradient(135deg, #6c5ce7, #a29bfe)", role: "Admin", isBot: false },
          { id: "ct_3", name: "Bilal Raza", username: "@bilal_r", initials: "BR", color: "linear-gradient(135deg, #fdcb6e, #e17055)", role: "Member", isBot: false },
          { id: "chat_lobby_bot", name: "Media Lobby Bot", username: "@MediaLobbyBot", initials: "ML", color: "linear-gradient(135deg, #00b894, #00cec9)", role: "Admin", isBot: true }
        ];
      }
    },

    getContacts() {
      this.ensureSocialData();
      return state.contacts;
    },

    addContact({ name, username, phone }) {
      this.ensureSocialData();
      const initials = name.split(/\s+/).map((w) => w[0] || "").join("").toUpperCase().slice(0, 2) || "CT";
      const colors = [
        "linear-gradient(135deg, #0984e3, #74b9ff)",
        "linear-gradient(135deg, #00b894, #55efc4)",
        "linear-gradient(135deg, #e84393, #fd79a8)",
        "linear-gradient(135deg, #f39c12, #f1c40f)"
      ];
      const contact = {
        id: "ct_" + Date.now(),
        name: name.trim(),
        username: username ? (username.startsWith("@") ? username : "@" + username) : "@" + name.toLowerCase().replace(/\s+/g, "_"),
        phone: phone || "+92 300 0000000",
        initials,
        color: colors[state.contacts.length % colors.length]
      };
      state.contacts.unshift(contact);
      save();
      return contact;
    },

    openOrCreateDirectChat(contact) {
      let existing = contact.chatId ? this.getChatById(contact.chatId) : null;
      if (!existing) {
        existing = state.chats.find(
          (c) => c.type === "personal" && !c.isSecret && (c.username || "").toLowerCase() === (contact.username || "").toLowerCase()
        );
      }
      if (existing) return existing;

      const newChat = {
        id: "chat_dm_" + Date.now(),
        type: "personal",
        name: contact.name,
        username: contact.username,
        initials: contact.initials,
        avatarColor: contact.color,
        verified: false,
        isBot: false,
        online: true,
        statusText: "online",
        pinned: false,
        muted: false,
        archived: false,
        unreadCount: 0,
        lastMessage: "Start a conversation",
        lastSender: "",
        lastTime: this.formatTime(),
        lastTimestamp: Date.now(),
        messages: []
      };
      state.chats.unshift(newChat);
      contact.chatId = newChat.id;
      save();
      return newChat;
    },

    getCalls() {
      this.ensureSocialData();
      return state.calls;
    },

    logCall({ chatId, name, initials, color, direction = "outgoing", duration = "0:05" }) {
      this.ensureSocialData();
      state.calls.unshift({
        id: "call_" + Date.now(),
        chatId,
        name,
        initials,
        color,
        direction,
        duration,
        time: "Today, " + this.formatTime()
      });
      save();
    },

    updateMyStory(text, bg) {
      const mine = state.stories.find((s) => s.isMine);
      if (!mine) return null;
      mine.text = text;
      mine.bg = bg;
      mine.time = "Just now";
      mine.seen = false;
      save();
      return mine;
    },

    toggleStoryLike(storyId) {
      const st = state.stories.find((s) => s.id === storyId);
      if (!st) return false;
      st.liked = !st.liked;
      save();
      return st.liked;
    },

    createGroupChat({ name, description, members }) {
      const me = this.getActiveAccount();
      const initials = name.split(/\s+/).map((w) => w[0] || "").join("").toUpperCase().slice(0, 2) || "GR";
      const allMembers = [
        { id: "m_you", name: me.name, username: me.username, initials: me.initials, color: me.color, role: "Owner", isBot: false },
        ...members
      ];

      const group = {
        id: "chat_grp_" + Date.now(),
        type: "group",
        name: name.trim(),
        username: "@" + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        description: description || "Group chat created on TeleClone",
        initials,
        avatarColor: "linear-gradient(135deg, #f093fb, #f5576c)",
        verified: false,
        isBot: false,
        online: false,
        statusText: `${allMembers.length} members, 1 online`,
        members: allMembers,
        pinned: false,
        muted: false,
        archived: false,
        unreadCount: 0,
        lastMessage: `Group "${name.trim()}" created`,
        lastSender: "",
        lastTime: this.formatTime(),
        lastTimestamp: Date.now(),
        messages: [
          {
            id: "m_grp_init_" + Date.now(),
            sender: "them",
            senderName: "System",
            text: `👥 Group **${name.trim()}** created with ${allMembers.length} member(s).`,
            time: this.formatTime(),
            status: "read"
          }
        ]
      };
      state.chats.unshift(group);
      save();
      return group;
    },

    createChannelChat({ name, username, description }) {
      const cleanUser = username ? (username.startsWith("@") ? username : "@" + username) : "@" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const initials = name.split(/\s+/).map((w) => w[0] || "").join("").toUpperCase().slice(0, 2) || "CH";

      const channel = {
        id: "chat_ch_" + Date.now(),
        type: "channel",
        name: name.trim(),
        username: cleanUser,
        description: description || "Broadcast channel",
        initials,
        avatarColor: "linear-gradient(135deg, #4facfe, #00f2fe)",
        verified: false,
        isBot: false,
        online: false,
        statusText: "1 subscriber",
        pinned: false,
        muted: false,
        archived: false,
        unreadCount: 0,
        lastMessage: "Channel created",
        lastSender: "",
        lastTime: this.formatTime(),
        lastTimestamp: Date.now(),
        messages: [
          {
            id: "m_ch_init_" + Date.now(),
            sender: "me",
            text: `📢 Channel **${name.trim()}** (${cleanUser}) is now live!`,
            time: this.formatTime(),
            status: "read"
          }
        ]
      };
      state.chats.unshift(channel);
      save();
      return channel;
    },

    createSecretChat(contact) {
      const secret = {
        id: "chat_sec_" + Date.now(),
        type: "personal",
        isSecret: true,
        selfDestruct: "1 minute",
        name: `🔒 ${contact.name}`,
        username: contact.username,
        initials: contact.initials,
        avatarColor: "linear-gradient(135deg, #27ae60, #2ecc71)",
        verified: false,
        isBot: false,
        online: true,
        statusText: "End-to-End Encrypted • Self-Destruct On",
        pinned: false,
        muted: false,
        archived: false,
        unreadCount: 0,
        lastMessage: "🔒 Secret chat started",
        lastSender: "",
        lastTime: this.formatTime(),
        lastTimestamp: Date.now(),
        messages: [
          {
            id: "m_sec_init_" + Date.now(),
            sender: "them",
            text: `🔒 **Secret Chat Established**\n• End-to-End Encrypted\n• No cloud storage\n• Self-destruct timer: **1 minute**\n• Forwarding disabled`,
            time: this.formatTime(),
            status: "read"
          }
        ]
      };
      state.chats.unshift(secret);
      save();
      return secret;
    },

    addMemberToGroup(chatId, member) {
      const chat = this.getChatById(chatId);
      if (!chat || chat.type !== "group") return false;
      if (!Array.isArray(chat.members)) chat.members = [];
      if (chat.members.some((m) => m.id === member.id)) return false;

      chat.members.push({
        id: member.id,
        name: member.name,
        username: member.username,
        initials: member.initials,
        color: member.color || member.avatarColor,
        role: member.isBot ? "Admin" : "Member",
        isBot: !!member.isBot
      });
      chat.statusText = `${chat.members.length} members, 2 online`;
      this.addMessage(chatId, {
        sender: "them",
        senderName: "System",
        text: `➕ **${member.name}** (${member.username})${member.isBot ? " [BOT]" : ""} was added to the group.`
      });
      save();
      return true;
    },

    toggleMemberAdmin(chatId, memberId) {
      const chat = this.getChatById(chatId);
      if (!chat || !Array.isArray(chat.members)) return null;
      const member = chat.members.find((m) => m.id === memberId);
      if (!member || member.role === "Owner") return null;
      member.role = member.role === "Admin" ? "Member" : "Admin";
      save();
      return member.role;
    },
    // ==================== MODULE 4: SETTINGS, SECURITY, FOLDERS & WALLET ====================
    ensureSettingsData() {
      const defaults = {
        fontSize: 15,
        bubbleRadius: 14,
        accentColor: "#8774e1",
        wallpaper: "wp-default",
        sendByEnter: true,
        passcodeEnabled: false,
        passcodePin: "",
        appLocked: false,
        twoFactorEnabled: false,
        twoFactorHint: "",
        powerSavingThreshold: 20,
        reduceAnimations: false,
        privacy: {
          phoneNumber: "My Contacts",
          lastSeen: "Everybody",
          profilePhoto: "Everybody",
          forwardedMessages: "Everybody",
          callsP2P: "My Contacts",
          groupsInvite: "My Contacts",
          selfDestruct: "6 months"
        },
        notifications: {
          privateChats: true,
          groups: true,
          channels: false,
          inAppSounds: true,
          showPreview: true
        },
        storage: {
          photosMB: 142,
          videosMB: 318,
          filesMB: 96,
          maxCacheGB: 5,
          autoRemove: "1 week",
          autoDownloadWifi: true,
          autoDownloadMobile: false,
          proxyEnabled: false,
          proxyServer: "mtproto.teleclone.net:443"
        },
        devices: [
          { id: "dev_1", name: "TeleClone Web (Current)", platform: "Browser • Chrome", location: "Pakistan", active: true, time: "Online" },
          { id: "dev_2", name: "Android Phone", platform: "TeleClone Android 10.4", location: "Lahore, PK", active: false, time: "2 hours ago" },
          { id: "dev_3", name: "Linux Desktop", platform: "TeleClone Desktop 5.2", location: "Islamabad, PK", active: false, time: "Yesterday" }
        ],
        wallet: {
          tonBalance: 24.5,
          starsBalance: 350,
          address: "UQBx7k9TeleCloneDemoWallet89vPqR2nM4xL",
          transactions: [
            { id: "tx_1", title: "Received TON", sub: "From @hamza_k", amount: "+10.0 TON", positive: true, time: "Today" },
            { id: "tx_2", title: "Telegram Stars Top-Up", sub: "In-App Purchase", amount: "+350 ⭐", positive: true, time: "Yesterday" },
            { id: "tx_3", title: "Bot Hosting Tip", sub: "To @MediaLobbyBot", amount: "-2.5 TON", positive: false, time: "2 days ago" }
          ]
        }
      };

      state.settings = {
        ...defaults,
        ...(state.settings || {}),
        privacy: { ...defaults.privacy, ...(state.settings?.privacy || {}) },
        notifications: { ...defaults.notifications, ...(state.settings?.notifications || {}) },
        storage: { ...defaults.storage, ...(state.settings?.storage || {}) },
        devices: Array.isArray(state.settings?.devices) ? state.settings.devices : defaults.devices,
        wallet: {
          ...defaults.wallet,
          ...(state.settings?.wallet || {}),
          transactions: Array.isArray(state.settings?.wallet?.transactions)
            ? state.settings.wallet.transactions
            : defaults.wallet.transactions
        }
      };
    },

    getSettings() {
      this.ensureSettingsData();
      return state.settings;
    },

    updateSettings(partial) {
      this.ensureSettingsData();
      Object.assign(state.settings, partial);
      save();
      return state.settings;
    },

    updateNestedSetting(section, key, value) {
      this.ensureSettingsData();
      if (!state.settings[section]) state.settings[section] = {};
      state.settings[section][key] = value;
      save();
    },

    updateActiveProfile({ name, username, phone, bio }) {
      const acc = this.getActiveAccount();
      if (!acc) return null;
      if (name && name.trim()) {
        acc.name = name.trim();
        acc.initials = acc.name
          .split(/\s+/)
          .map((w) => w[0] || "")
          .join("")
          .toUpperCase()
          .slice(0, 2) || acc.initials;
      }
      if (username && username.trim()) {
        const clean = username.trim();
        acc.username = clean.startsWith("@") ? clean : "@" + clean;
      }
      if (phone && phone.trim()) acc.phone = phone.trim();
      acc.bio = (bio || "").trim();
      save();
      return acc;
    },

    addCustomFolder(label) {
      const clean = label.trim();
      if (!clean) return null;
      const id = "custom_" + Date.now();
      state.folders.push({ id, label: clean, custom: true });
      save();
      return id;
    },

    deleteCustomFolder(folderId) {
      state.folders = state.folders.filter((f) => !(f.custom && f.id === folderId));
      if (state.activeFolder === folderId) state.activeFolder = "all";
      save();
    },

    clearCacheStorage() {
      this.ensureSettingsData();
      const total =
        state.settings.storage.photosMB +
        state.settings.storage.videosMB +
        state.settings.storage.filesMB;
      state.settings.storage.photosMB = 0;
      state.settings.storage.videosMB = 0;
      state.settings.storage.filesMB = 0;
      save();
      return total;
    },

    terminateDevice(deviceId) {
      this.ensureSettingsData();
      state.settings.devices = state.settings.devices.filter((d) => d.active || d.id !== deviceId);
      save();
    },

    walletTransaction({ title, sub, deltaTon = 0, deltaStars = 0 }) {
      this.ensureSettingsData();
      const w = state.settings.wallet;
      if (deltaTon < 0 && w.tonBalance + deltaTon < 0) return false;
      w.tonBalance = Number((w.tonBalance + deltaTon).toFixed(2));
      w.starsBalance = Math.max(0, w.starsBalance + deltaStars);
      w.transactions.unshift({
        id: "tx_" + Date.now(),
        title,
        sub,
        amount:
          deltaTon !== 0
            ? `${deltaTon > 0 ? "+" : ""}${deltaTon} TON`
            : `${deltaStars > 0 ? "+" : ""}${deltaStars} ⭐`,
        positive: deltaTon > 0 || deltaStars > 0,
        time: "Just now"
      });
      save();
      return true;
    },

    resetDemo() {
      state = structuredClone(DEFAULT_STATE);
      save();
    }
  };
})();