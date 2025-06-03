'use client';

import { useEffect, useRef } from 'react';

export default function Home() {
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const isInitiatorRef = useRef(false);

  useEffect(() => {
    let cleanedUp = false;

    async function initWebRTC() {
      // Pick ws:// or wss:// based on page protocol:
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${protocol}://${window.location.host}/api/socket`);
      wsRef.current = ws;

      // Create RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcRef.current = pc;

      // Send ICE candidates over WebSocket
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          ws.send(
            JSON.stringify({ type: 'candidate', candidate: e.candidate })
          );
        }
      };

      // When remote track arrives, attach to remote <video>
      pc.ontrack = (e) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = e.streams[0];
        }
      };

      // Get local media & add track(s)
      try {
        const localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }
        localStream.getTracks().forEach((track) => {
          pc.addTrack(track, localStream);
        });
      } catch (err) {
        console.error('Error accessing media devices:', err);
        return;
      }

      // Send a “join” as soon as WS opens
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join' }));
      };

      // Handle incoming signaling messages
      ws.onmessage = async (msgEv) => {
        const data = JSON.parse(msgEv.data);
        switch (data.type) {
          case 'join':
            if (!isInitiatorRef.current) {
              isInitiatorRef.current = true;
              await doCall(pc, ws);
            }
            break;

          case 'offer':
            if (!isInitiatorRef.current) {
              await pc.setRemoteDescription(new RTCSessionDescription(data));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              ws.send(JSON.stringify(pc.localDescription));
            }
            break;

          case 'answer':
            if (isInitiatorRef.current) {
              await pc.setRemoteDescription(new RTCSessionDescription(data));
            }
            break;

          case 'candidate':
            if (data.candidate) {
              try {
                await pc.addIceCandidate(data.candidate);
              } catch (e) {
                console.error('Error adding ICE candidate:', e);
              }
            }
            break;

          default:
            console.warn('Unknown signaling message:', data.type);
        }
      };

      // If renegotiation is ever needed, only the initiator calls doCall()
      pc.onnegotiationneeded = async () => {
        if (
          isInitiatorRef.current &&
          pc.localDescription?.type !== 'offer'
        ) {
          await doCall(pc, ws);
        }
      };
    }

    initWebRTC();

    return () => {
      if (cleanedUp) return;
      cleanedUp = true;
      wsRef.current?.close();
      pcRef.current?.close();
      if (localVideoRef.current) {
        localVideoRef.current.pause();
        localVideoRef.current.srcObject = null;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.pause();
        remoteVideoRef.current.srcObject = null;
      }
    };
  }, []); // no isInitiatorRef in dependencies

  return (
    <div className="flex flex-col items-center space-y-4">
      <h1 className="text-2xl font-bold">
        WebRTC 2-Way Chat (Next.js + WebSocket)
      </h1>
      <div className="flex gap-4">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="w-1/2 border border-gray-300"
        />
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-1/2 border border-gray-300"
        />
      </div>
    </div>
  );
}

async function doCall(pc: RTCPeerConnection, ws: WebSocket) {
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify(pc.localDescription));
  } catch (err) {
    console.error('Error creating or sending offer:', err);
  }
}
