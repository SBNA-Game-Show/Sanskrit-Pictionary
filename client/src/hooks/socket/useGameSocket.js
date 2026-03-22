import { useEffect } from "react";
import { socket } from "../../pages/socket";
import { useParams, useNavigate } from "react-router-dom";
import { toastError, toastInfo, toastSuccess, toastWarning } from "../../utils/toast";
import { getUserId, getDisplayName } from "../../utils/authStorage";
import { makeAvatarDataUrl } from "../../utils/game/avatarUtils";

export const useGameSocket = (
  setCurrentUserId,
  players,
  setPlayers,
  setHostData,
  drawerId,
  setDrawerId,
  setDrawerTeam,
  setCurrentPlayerName,
  setTimeLeft,
  setFlashcard,
  setMyTeam,
  setRemainingGuesses,
  totalGuesses,
  setTotalGuesses,
  setProfiles,
  setIsGamePaused,
  setPausedByHost,
  setRoundResult,
  setRoundReveal,
  setCorrectUserIds,
  setAnswer,
  setImageChoices,
  setRoundKey,
  setEraseMode,
  isGameEndedRef,
  canvasRef,
  correctAudioRef,
  wrongAudioRef,
  revealAudioRef,
  roundRevealTimeoutRef,
  profilesRef,
  playersRef,
  hostRef,
) => {
  const { roomId } = useParams();
  const navigate = useNavigate();

  // ---------- Socket setup ----------
  useEffect(() => {
    const userId = getUserId();
    setCurrentUserId(userId || "");
    console.log("[Play] mounting | roomId=", roomId, "userId=", userId);
    if (!roomId) return;

    // Function to rejoin and sync state
    const rejoinAndSync = async () => {
      // Checking room existence before joining
      const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5005";

      try {
        // Call API for room exists status
        const response = await fetch(`${API_BASE}/api/room/exists/${roomId}`);
        const data = await response.json();

        if (data.exists) {
          // Emit registerLobby only when room exists
          socket.emit("registerLobby", {
            userId,
            displayName: getDisplayName() || userId,
            roomId,
          });
          socket.emit("getGameState", { roomId });
          socket.emit("requestLobbyUsers", { roomId });
        } else {
          // Navigate to home if room code is invalid.
          toastError("Invalid room code! Navigating to the lobby", {
            toastId: "invalid-room",
          });
          navigate(`/lobby`, { replace: true });
        }
      } catch (error) {
        console.error("[Play] Failed to verify room status:", error);
      }
    };

    rejoinAndSync();

    const handleReconnect = () => {
      console.log("[Play] Socket reconnected, rejoining game");
      rejoinAndSync();
    };

    socket.on("connect", handleReconnect);

    socket.on("playerDisconnected", ({ userId, displayName }) => {
      toastWarning(`${displayName} disconnected`, { autoClose: 2000 });
    });

    socket.on("playerReconnected", ({ userId, displayName }) => {
      toastInfo(`${displayName} reconnected! 🎮`, { autoClose: 2000 });
    });

    socket.on("hostDisconnectedOthers", ({ hostName, hostId }) => {
      if (hostId === getUserId()) return;
      isGameEndedRef.current = true;
      toastError(`Host ${hostName} disconnected. You have been kicked out.`, {
        autoClose: 4000,
      });
      navigate("/lobby");
    });

    socket.on("gamePaused", ({ hostName }) => {
      setIsGamePaused(true);
      setPausedByHost(hostName);
    });

    socket.on("gameResumed", ({ hostName }) => {
      setIsGamePaused(false);
      setPausedByHost("");
      toastInfo(`Host ${hostName} returned! Game resumed.`, {
        autoClose: 3000,
      });
    });

    socket.on("userKicked", (kickedPlayer) => {
      if (kickedPlayer.userId === getUserId()) {
        isGameEndedRef.current = true;
        toastInfo("You were kicked from the game.");
        navigate("/lobby");
      } else {
        toastInfo(`${kickedPlayer.displayName} was kicked from the game.`);
      }
    });

    const onLobbyUsers = (users) => {
      const map = {};
      (users || []).forEach((u) => {
        map[u.userId] = {
          displayName: u.displayName,
          avatarSeed: u.avatarSeed,
          avatarStyle: u.avatarStyle,
          avatarData: u.avatarData,
        };
      });
      setProfiles(map);
      profilesRef.current = map;
    };
    socket.on("lobbyUsers", onLobbyUsers);

    // Navigate to /lobby/code if the game not started
    socket.once("newGame", (data) => {
      toastWarning("Game is not started! Navigating to the lobby");
      navigate(`/lobby/${data.roomId}`, { replace: true });
    });

    const onProfileUpdated = ({
      userId,
      displayName,
      avatarSeed,
      avatarStyle,
      avatarData,
    }) => {
      setProfiles((prev) => {
        const updated = {
          ...prev,
          [userId]: {
            displayName: displayName ?? prev[userId]?.displayName,
            avatarSeed: avatarSeed ?? prev[userId]?.avatarSeed,
            avatarStyle: avatarStyle ?? prev[userId]?.avatarStyle,
            avatarData: avatarData ?? prev[userId]?.avatarData,
          },
        };
        profilesRef.current = updated;
        return updated;
      });
    };
    socket.on("profileUpdated", onProfileUpdated);

    // ✅ UPDATED: gameState with canvas data
    socket.on("gameState", (state) => {
      console.log("[Play] received gameState:", state);
      const serverFlash = state.currentFlashcard ?? state.flashcard ?? null;

      setTotalGuesses(state.guesses); // set total guesses
      setPlayers((prev) => {
        const prevMap = new Map((prev || []).map((p) => [p.userId, p]));
        const merged = (state.players || []).map((p) => {
          const prevP = prevMap.get(p.userId);
          return {
            ...p,
            remainingGuesses:
              p.remainingGuesses ?? prevP?.remainingGuesses ?? totalGuesses,
          };
        });
        playersRef.current = merged;
        return merged;
      });
      setHostData(state.hostData || null);
      setDrawerId(state.drawer?.userId || null);
      setDrawerTeam(state.drawer?.team || "");
      setCurrentPlayerName(state.drawer?.displayName || "");
      setTimeLeft(state.timer || 0);

      if (serverFlash) setFlashcard(serverFlash);

      const me = (state.players || []).find((p) => p.userId === userId);
      setMyTeam(me?.team || "");
      setRemainingGuesses(
        me?.remainingGuesses !== undefined ? me.remainingGuesses : totalGuesses,
      );

      // ✅ Handle canvas data from gameState
      if (canvasRef.current) {
        canvasRef.current.clearCanvas();

        if (state.canvasData && state.canvasData.length > 0) {
          setTimeout(() => {
            if (canvasRef.current) {
              console.log("[Play] Loading canvas data from gameState");
              canvasRef.current.loadPaths(state.canvasData);
            }
          }, 100);
        }
      }
    });

    socket.on("updatePlayers", (list) => {
      setPlayers((prev) => {
        const prevMap = new Map((prev || []).map((p) => [p.userId, p]));
        const merged = (list || []).map((p) => {
          const prevP = prevMap.get(p.userId);
          return {
            ...p,
            remainingGuesses:
              p.remainingGuesses ?? prevP?.remainingGuesses ?? totalGuesses,
          };
        });
        playersRef.current = merged;
        return merged;
      });

      const me = (list || []).find((p) => p.userId === userId);
      setMyTeam(me?.team || "");
      setRemainingGuesses(
        me?.remainingGuesses !== undefined ? me.remainingGuesses : totalGuesses,
      );
    });

    // drawerChanged clears canvas
    socket.on("drawerChanged", ({ userId: newDrawerId, displayName, team }) => {
      console.log("[Play] drawerChanged", {
        newDrawerId,
        displayName,
        team,
        clientUserId: getUserId(),
      });

      setDrawerId(newDrawerId);
      setDrawerTeam(team || "");

      const name =
        typeof displayName === "string"
          ? displayName
          : displayName?.displayName || displayName?.userId || "";
      setCurrentPlayerName(name);

      // Clear canvas when drawer changes
      if (canvasRef.current) {
        canvasRef.current.clearCanvas();
      }
    });

    socket.on("timerUpdate", ({ secondsLeft }) => {
      setTimeLeft(secondsLeft);
    });

    socket.on("drawing-data", (data) => {
      if (canvasRef.current) {
        canvasRef.current.clearCanvas();
        canvasRef.current.loadPaths(data);
      }
    });

    socket.on("newFlashcard", (data) => {
      console.log("[Play] received newFlashcard (drawer-only):", {
        data,
        clientUserId: getUserId(),
        drawerId,
        translation: data.translation ?? data.hint ?? "",
        imageSrc: data.imageSrc ?? data.image ?? "",
        audioSrc: data.audioSrc ?? data.audio ?? "",
      });
      setFlashcard(data);
    });

    // roundStarted clears canvas
    socket.on("roundStarted", ({ currentRound, currentPlayer, timer }) => {
      console.log("[Play] roundStarted payload:", {
        currentRound,
        currentPlayer,
        timer,
      });

      let cpName = "";
      if (typeof currentPlayer === "string") cpName = currentPlayer;
      else if (currentPlayer && typeof currentPlayer === "object")
        cpName = currentPlayer.displayName || currentPlayer.userId || "";

      setCurrentPlayerName(cpName);
      setAnswer("");
      setTimeLeft(timer || 0);
      setRemainingGuesses(totalGuesses);
      setCorrectUserIds([]); // Reset the correct answer highlights

      // Reset answer and choices when drawer changes
      setImageChoices([]);
      setRoundKey((k) => k + 1);
      setFlashcard(null); //  clear old card instantly
      socket.emit("getGameState", { roomId }); // fetch new card

      // Clear canvas when new round starts
      if (canvasRef.current) {
        canvasRef.current.clearCanvas();
      }
    });

    socket.on("correctAnswer", ({ displayName, scoreGained, userId }) => {
      if (userId === getUserId()) {
        correctAudioRef.current.currentTime = 0;
        correctAudioRef.current.play();
      }
      if (userId) {
        setCorrectUserIds((prev) =>
          prev.includes(userId) ? prev : [...prev, userId],
        );
      }
      toastSuccess(
        `🎉 ${displayName || "Someone"} guessed correctly and earned ${scoreGained} points!`,
        {
          autoClose: 3000,
          position: "top-left",
        },
      );
    });

    socket.on(
      "wrongAnswer",
      ({ userId: wrongUserId, displayName, remainingGuesses, scoreLost }) => {
        if (wrongUserId === getUserId()) {
          wrongAudioRef.current.currentTime = 0;
          wrongAudioRef.current.play();
        }

        console.log("[Play] wrongAnswer", {
          wrongUserId,
          displayName,
          remainingGuesses,
          scoreLost,
        });
        if (wrongUserId === getUserId() && remainingGuesses !== undefined) {
          setRemainingGuesses(remainingGuesses);
        }

        // Update the user list for everyone immediately (server also emits updatePlayers,
        // but this makes the UI responsive even if packets arrive out-of-order)
        if (wrongUserId && remainingGuesses !== undefined) {
          setPlayers((prev) => {
            const next = (prev || []).map((p) =>
              p.userId === wrongUserId ? { ...p, remainingGuesses } : p,
            );
            playersRef.current = next;
            return next;
          });
        }

        // Show penalty notification if this is the current user
        if (scoreLost && wrongUserId === getUserId()) {
          setRoundResult({
            type: "wrong",
            displayName: displayName || "You",
            scoreLost: scoreLost,
          });
          setTimeout(() => setRoundResult(null), 1200);
        }
      },
    );

    socket.on("guessesExhausted", () => {
      console.log("[Play] guessesExhausted");

      setRoundResult({
        type: "guessesExhausted",
        displayName: "Out of guesses!",
      });
      setTimeout(() => setRoundResult(null), 1500);
    });

    // Helper: converts flashcard image path → matching audio pronunciation file
    // Example: /FlashCardEasy/bird.png → /FlashCardEasy/audio/bird.mp3
    const imageToAudio = (imageSrc) => {
      if (!imageSrc) return "";
      const src = imageSrc.startsWith("/") ? imageSrc : `/${imageSrc}`;
      const parts = src.split("/").filter(Boolean);
      const folder = parts[0];
      const file = parts[parts.length - 1];
      const base = file.split(".")[0].toLowerCase();
      return `/${folder}/audio/${base}.mp3`;
    };

    // ADDED: Round reveal audio system
    // - Plays pronunciation sound when the correct word popup appears
    // - Uses server audioSrc if available
    // - Falls back to generating audio path from imageSrc
    // - Uses refs to prevent multiple overlapping sounds
    // - Clears previous timeout and audio before starting new one
    socket.on("turnEnded", (data) => {
      console.log("[Play] turnEnded", data);

      if (roundRevealTimeoutRef.current) {
        clearTimeout(roundRevealTimeoutRef.current);
      }

      setRoundReveal({
        word: data.word,
        transliteration: data.transliteration,
        imageSrc: data.imageSrc,
      });

      const resolvedAudioSrc = data.audioSrc || imageToAudio(data.imageSrc);
      console.log("[Play] resolvedAudioSrc:", resolvedAudioSrc);

      if (resolvedAudioSrc && revealAudioRef.current) {
        const audioEl = revealAudioRef.current;

        try {
          audioEl.pause();
          audioEl.removeAttribute("src");
          audioEl.load();

          audioEl.src = resolvedAudioSrc;
          audioEl.currentTime = 0;

          const playPromise = audioEl.play();
          if (playPromise !== undefined) {
            playPromise.catch((err) => {
              console.warn(
                "[Play] reveal audio play failed:",
                err,
                resolvedAudioSrc,
              );
            });
          }
        } catch (err) {
          console.warn("[Play] audio reset/play error:", err, resolvedAudioSrc);
        }
      }

      roundRevealTimeoutRef.current = setTimeout(() => {
        setRoundReveal(null);

        if (revealAudioRef.current) {
          revealAudioRef.current.pause();
          revealAudioRef.current.currentTime = 0;
        }
      }, 5000);
    });

    socket.on("clear-canvas", () => {
      canvasRef.current?.clearCanvas();
      canvasRef.current?.eraseMode(false);
      setEraseMode(false);
    });

    socket.on("warnDrawer", (drawerId, newScore) => {
      canvasRef.current?.clearCanvas();

      setPlayers((prev) => {
        const next = (prev || []).map((p) =>
          p.userId === drawerId ? { ...p, points: newScore } : p,
        );

        playersRef.current = next;
        return next;
      });
    });

    socket.on("gameEnded", (data) => {
      isGameEndedRef.current = true;
      setRoundResult({ type: "gameEnded" });
      const base = Array.isArray(playersRef.current)
        ? playersRef.current
        : players;

      const currentProfiles = profilesRef.current;

      const withAvatars = data.finalPlayers.map((p) => {
        const prof = currentProfiles[p.userId] || {};
        const seed = prof.avatarSeed || p.displayName || p.userId || "player";
        const style = prof.avatarStyle || "funEmoji";

        // Use custom avatar if available
        const avatarUrl = prof.avatarData || makeAvatarDataUrl(style, seed);
        return {
          ...p,
          avatar: avatarUrl,
          avatarSeed: seed,
          avatarStyle: style,
        };
      });

      // Warning popup for force ending by insufficient players
      if (data.reason === "insufficient team member") {
        toastWarning(`Game ended: Minimum player requirement not met.`, {
          autoClose: 2000,
        });
      }

      setTimeout(() => {
        setRoundResult(null);
        if (hostRef.current) {
          socket.emit("deleteRoom", { roomId });
        }
        navigate("/end", { state: { players: withAvatars } });
      }, 1200);
    });

    return () => {
      socket.off("connect", handleReconnect);
      socket.off("playerDisconnected");
      socket.off("playerReconnected");
      socket.off("hostDisconnectedOthers");
      socket.off("gamePaused");
      socket.off("gameResumed");
      socket.off("userKicked");
      socket.off("lobbyUsers", onLobbyUsers);
      socket.off("newGame");
      socket.off("profileUpdated", onProfileUpdated);
      socket.off("gameState");
      socket.off("updatePlayers");
      socket.off("drawerChanged");
      socket.off("turnEnded");
      socket.off("timerUpdate");
      socket.off("drawing-data");
      socket.off("newFlashcard");
      socket.off("roundStarted");
      socket.off("correctAnswer");
      socket.off("wrongAnswer");
      socket.off("guessesExhausted");
      socket.off("clear-canvas");
      socket.off("warnDrawer");
      socket.off("gameEnded");

      // Check for unnatural unmount (e.g. navbar navigation)
      if (!isGameEndedRef.current) {
        console.log("[Play] Unmounting mid-game, simulating disconnect...");
        socket.emit("manualDisconnect");
      }
    };
  }, [roomId, navigate]); // eslint-disable-next-line react-hooks/exhaustive-deps
};
