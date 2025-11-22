import { User } from "./UserManager";

interface Room {
  id: string;
  user1: User;
  user2: User;
  timeout?: NodeJS.Timeout;
}

let GLOBAL_ROOM_ID = 1;

export class RoomManager {
  private rooms: Map<string, Room>;

  constructor() {
    this.rooms = new Map();
  }

  findRoomBySocketId(socketId: string) {
    for (const room of this.rooms.values()) {
      if (
        room.user1.socket.id === socketId ||
        room.user2.socket.id === socketId
      ) {
        return room;
      }
    }
    return null;
  }

  deleteRoomById(room: Room) {
    if (!this.rooms.has(room.id)) return;

    // Clean pending timeout (important!)
    if (room.timeout) {
      clearTimeout(room.timeout);
    }

    this.rooms.delete(room.id);
    console.log(`Room ${room.id} deleted`);
  }

  chatMessage(roomId: string, senderSocketId: string, message: string) {
    const room = this.rooms.get(roomId);
    if (!room) return console.warn(`Room ${roomId} not found for chat`);

    const receiver =
      room.user1.socket.id === senderSocketId ? room.user2 : room.user1;

    if (!receiver?.socket?.connected) {
      console.warn(`Receiver is not connected, dropping message`);
      return;
    }

    receiver.socket.emit("receive-message", { message });
  }

  createRoom(user1: User, user2: User) {
    const roomId = String(GLOBAL_ROOM_ID++);
    const room: Room = { id: roomId, user1, user2 };
    this.rooms.set(roomId, room);

    console.log(`Created room ${roomId} for ${user1.socket.id} and ${user2.socket.id}`);

    user1.socket.emit("room-ready", { roomId });
    user2.socket.emit("room-ready", { roomId });

    // Delay sender's offer so both clients are ready
    room.timeout = setTimeout(() => {
      if (!this.rooms.has(roomId)) return; // room was deleted before timeout
      if (!user1.socket.connected) return;

      user1.socket.emit("send-offer", { roomId });
    }, 500);

    return roomId;
  }

  onOffer(roomId: string, sdp: string, senderSocketId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return console.warn(`Room ${roomId} not found for offer`);

    const receiver =
      room.user1.socket.id === senderSocketId ? room.user2 : room.user1;

    if (!receiver?.socket?.connected) {
      return console.warn(`Receiver disconnected, drop offer`);
    }

    receiver.socket.emit("offer", { sdp, roomId });
  }

  onAnswer(roomId: string, sdp: string, senderSocketId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return console.warn(`Room ${roomId} not found for answer`);

    const receiver =
      room.user1.socket.id === senderSocketId ? room.user2 : room.user1;

    if (!receiver?.socket?.connected) {
      return console.warn(`Receiver disconnected, drop answer`);
    }

    receiver.socket.emit("answer", { sdp, roomId, senderSocketId });
  }

  onIceCandidate(roomId: string, senderSocketId: string, candidate: any) {
    const room = this.rooms.get(roomId);
    if (!room) return console.warn(`Room ${roomId} not found for ICE`);

    const receiver =
      room.user1.socket.id === senderSocketId ? room.user2 : room.user1;

    if (!receiver?.socket?.connected) {
      return console.warn(`Receiver disconnected, drop ICE`);
    }

    receiver.socket.emit("add-ice-candidate", {
      candidate,
      roomId,
      senderSocketId,
    });
  }
}
