const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const Search = require('./models/Search');

const app = express();
const port = 3000;

const mongoUri = 'mongodb+srv://kirandchennai:Mjk8Yms88P6r3NF1@cluster0.z7kvg3f.mongodb.net/';
mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

const searchRoutes = require('./routes/Search');

app.use(bodyParser.json());

// Use CORS with options to allow requests from your frontend
app.use(cors({
  origin: '*', // Change this to your frontend URL
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type'],
}));

app.use('/search', searchRoutes);

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*', // Change this to your frontend URL
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type'],
  }
});

const changeStream = Search.watch();

changeStream.on('change', (change) => {
  if (change.operationType === 'insert') {
    const newData = {
      id: change.fullDocument._id,
      userId: change.fullDocument.userId,
      query: change.fullDocument.query,
    };
    console.log('Emitting newData:', newData);
    io.emit('newData', newData);
  } else if (change.operationType === 'delete') {
    const deletedData = {
      id: change.documentKey._id,
    };
    console.log('Emitting deletedData:', deletedData);
    io.emit('deletedData', deletedData);
  }else if (change.operationType === 'invalidate') {
    console.log('Database drop detected');
    io.emit('refreshApp');
  }
});

let activeChats = []; // To keep track of active chats
let pendingRequests = []; // To keep track of pending chat requests
const disconnectTimestamps = {}; // To keep track of user disconnection timestamps

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('register', (userId) => {
    socket.userId = userId;
    console.log(`User registered with ID: ${userId}`);

    // Clear the disconnection timestamp if the user reconnects within 20 seconds
    if (disconnectTimestamps[userId]) {
      delete disconnectTimestamps[userId];
    }
  });

  socket.on('chatRequest', (data) => {
    console.log('Received chatRequest:', data);
    if (!activeChats.includes(data.fromUserId) && !activeChats.includes(data.toUserId)) {
      pendingRequests.push(data);
      io.emit('chatRequest', data);
      updateChatStatus();

      // Clear the pending request after 5 seconds if not accepted
      setTimeout(() => {
        pendingRequests = pendingRequests.filter(request => request.fromUserId !== data.fromUserId || request.toUserId !== data.toUserId);
        updateChatStatus();
      }, 6000);
    }
  });
  
  socket.on('acceptChat', (data) => {
    console.log('Chat accepted:', data);
    activeChats.push(data.fromUserId);
    activeChats.push(data.toUserId);
    pendingRequests = pendingRequests.filter(
      request => !(request.fromUserId === data.fromUserId && request.toUserId === data.toUserId)
    );
    io.emit('chatAccepted', data);
    updateChatStatus();
  });

  socket.on('closeChat', (data) => {
    console.log('Chat closed:', data);
    activeChats = activeChats.filter(userId => userId !== data.fromUserId && userId !== data.toUserId);
    io.emit('closeChat', data);
    updateChatStatus();
  });

  socket.on('message', (data) => {
    console.log('Received message:', data);
    io.emit('message', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    disconnectTimestamps[socket.userId] = Date.now();

    // Set a timeout to check after 20 seconds
    setTimeout(() => {
      const currentTime = Date.now();
      if (disconnectTimestamps[socket.userId] && (currentTime - disconnectTimestamps[socket.userId]) >= 20000) {
        delete disconnectTimestamps[socket.userId];

        // Emit a close chat event after the user is inactive for 20 seconds
        activeChats = activeChats.filter(userId => userId !== socket.userId);
        pendingRequests = pendingRequests.filter(
          request => request.fromUserId !== socket.userId && request.toUserId !== socket.userId
        );
        updateChatStatus();
        io.emit('closeChat', { toUserId: socket.userId });
      }
    }, 20000);

    updateChatStatus();
  });

  function updateChatStatus() {
    io.emit('chatStatus', { activeChats, pendingRequests });
  }
});

server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});