import { useState, useEffect, useMemo, Fragment, useRef } from "react";
import { Square, Color } from "chess.js/src/chess";
import FusionBoard from "./FusionBoard";
import { Chessboard } from "react-chessboard";
import Stockfish from "./Stockfish";
import "./App.css";

function App() {
    const [game] = useState(new FusionBoard());
    const [isClicked, setIsClicked] = useState<Square | null>(null);
    const [fen, setFen] = useState(game.positions[0]);
    const [isGameStarted, setIsGameStarted] = useState<boolean>(false);
    const [isStockfishOn, setIsStockfishOn] = useState<boolean>(true);
    const [sounds, setSounds] = useState<HTMLAudioElement[]>([]);
    const [squareAttributes, setSquareAttributes] = useState<{ [key: string]: object }>({});
    const [rightClicked, setRightClicked] = useState<{ [key: string]: object | undefined }>({});
    const [fusedDisplay, setFusedDisplay] = useState<{ [key: string]: object | undefined }>({});
    const [msgAlert, setMsgAlert] = useState("");
    const timeoutRef = useRef<number | null>(null);
    const [boardWidth, setBoardWidth] = useState<number>(
        Math.max(400, Math.min(document.documentElement.clientHeight, document.documentElement.clientWidth) - 15)
    );

    // Get all audio files and store them in a state array
    useMemo(() => {
        setSounds([
            new Audio("/assets/checkmate.mp3"),
            new Audio("/assets/check.mp3"),
            new Audio("/assets/draw.mp3"),
            new Audio("/assets/capture.mp3"),
            new Audio("/assets/castle.mp3"),
            new Audio("/assets/move.mp3"),
        ]);
        sounds.forEach((sound) => {
            sound.load();
        });
    }, []);

    // Force a rerender if the screen dimensions change
    useEffect(() => {
        const handleResize = () => {
            setBoardWidth(
                Math.max(
                    400,
                    Math.min(document.documentElement.clientHeight, document.documentElement.clientWidth) - 15
                )
            );
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const pieces = ["wP", "wN", "wB", "wR", "wQ", "wK", "bP", "bN", "bB", "bR", "bQ", "bK"];
    const customPieces = () => {
        const returnPieces = {} as Record<(typeof pieces)[number], (props: { squareWidth: number }) => JSX.Element>;
        pieces.map((p) => {
            returnPieces[p] = ({ squareWidth }) => {
                return (
                    <div
                        style={{
                            width: squareWidth,
                            height: squareWidth,
                            backgroundImage: `url(/assets/pieces/${p}.png)`,
                            backgroundSize: "100%",
                            backgroundRepeat: "no-repeat",
                        }}
                    />
                );
            };
            return null;
        });
        return returnPieces;
    };

    function reset() {
        game.reset();
        setFen(game.fen());
        setIsClicked(null);
        setSquareAttributes({});
        setIsGameStarted(false);
        setFusedDisplay({});
    }

    function importGame() {
        // Prompt user for custom Fusion Chess export string from exportGame()
        const e_string = prompt("Enter valid Fusion Chess export string: ");
        try {
            if (!e_string) return;
            reset();
            game.import(e_string);
            setFen(game.fen());
        } catch (err) {
            alert(err);
        }
    }

    function exportGame() {
        // Export game to a string that can be imported later
        const exportString = game.export();
        navigator.clipboard.writeText(exportString);
        alert(`Exported to clipboard: ${exportString}`);
    }

    function onDrop(sourceSquare: Square, targetSquare: Square) {
        // Don't move if the game is over
        if (game.isGameOver() || !isGameStarted) return false;
        setRightClicked({});
        setIsClicked(null);
        try {
            const move = game.movePiece(sourceSquare, targetSquare);
            if (move === false) {
                return false;
            }
            // Play sounds depending on the event
            if (game.isInCheckmate()) {
                // Checkmate
                sounds[0].play();
            } else if (game.isDraw()) {
                // Stalemate or draw
                sounds[2].play();
            } else if (game.isInCheck()) {
                // Check
                sounds[1].play();
            } else if (typeof move !== "boolean" && move?.captured) {
                // Capture
                sounds[3].play();
            } else if (move.san === "O-O" || move.san === "O-O-O") {
                // Castling
                sounds[4].play();
            } else {
                // Normal move
                sounds[5].play();
            }
            // Clear board from highlighting
            setSquareAttributes({});
        } catch (e) {
            console.error(e);
            return false;
        }
        // Trigger a re-render by updating fen state, as updating object will not trigger it
        setFen(game.fen());
        return true;
    }

    function onClick(square: Square) {
        setRightClicked({});
        if (game.isGameOver() || !isGameStarted) return;
        onHover(square);
        if (isClicked && square !== isClicked) {
            // Must be trying to make a move on the board
            onDrop(isClicked, square);
            for (const key in squareAttributes) {
                if (key !== square) {
                    // Reset all square attributes to default
                    squareAttributes[key] = {
                        backgroundColor: "revert",
                    };
                }
            }
            setIsClicked(null);
        } else {
            if (!game.get(square) || game.get(square).color !== game.turn()) return;
            setIsClicked(square);
            setSquareAttributes({
                ...squareAttributes,
                [square]: {
                    backgroundColor: "rgba(255, 255, 64, 0.75)",
                },
            });
        }
    }

    function onHover(square: Square) {
        if (game.isGameOver() || isClicked || !isGameStarted) return;
        const moves = game.moves({ square: square, verbose: true });
        let edits = {};
        for (let i = 0; i < moves.length; i++) {
            // Assign edits to a variable to avoid re-rendering for each move
            edits = {
                ...edits,
                [moves[i].to]: {
                    backgroundImage:
                        game.get(moves[i].to) && game.get(moves[i].to).color !== game.get(square).color
                            ? "radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)"
                            : "radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)",
                    borderRadius: "50%",
                },
            };
        }
        // Check if the current square has a fused piece on it
        let fused = Object.entries(game.positions[1]).find((piece) => piece[0] === square);
        const fusedKings = Object.entries(game.positions[3]);
        for (let i = 0; i < fusedKings.length; i++) {
            if (fusedKings[i][0][0] === (game.turn() === "w" ? "b" : "w")) continue;
            if (fused) {
                fused.concat([game.findKing(fusedKings[i][0][0] as Color), fusedKings[i][1]]);
            } else {
                fused = [game.findKing(fusedKings[i][0][0] as Color), fusedKings[i][1]];
            }
        }
        if (fused) {
            // If it does, highlight the additional moves of the fused piece
            const moves = game.getFusedMoves(fused, square);
            for (let i = 0; i < moves.length; i++) {
                // Ensure to only assign moves that we are hovering, and to ensure it is our turn
                if (moves[i].includes(square) && game.turn() === game.get(square).color) {
                    edits = {
                        ...edits,
                        [moves[i].slice(-2)]: {
                            backgroundImage:
                                game.get(moves[i].slice(-2) as Square) &&
                                game.get(moves[i].slice(-2) as Square).color !== game.get(square).color
                                    ? "radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)"
                                    : "radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)",
                            borderRadius: "50%",
                        },
                    };
                }
            }
        }
        // Highlight squares by updating the styles board state
        setSquareAttributes(edits);
    }

    function onRightClick(square: Square) {
        const colour = "rgba(255, 0, 0, 0.4)";
        setRightClicked({
            ...rightClicked,
            [square]:
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                rightClicked[square] && rightClicked[square].backgroundColor === colour
                    ? undefined
                    : { backgroundColor: colour },
        });
    }

    function onHoverLeave(square: Square) {
        if (isClicked === square || !isGameStarted) return;
        const moves = game.moves({ square: square, verbose: true });
        for (let i = 0; i < moves.length; i++) {
            // Remove highlighting by updating the styles board state
            setSquareAttributes({
                ...squareAttributes,
                [moves[i].to]: {
                    backgroundColor: "revert",
                },
            });
        }
    }

    function start() {
        new Audio("/assets/start.mp3").play();
        setIsGameStarted(true);
    }

    useEffect(() => {
        // Handle game conditions
        if (game.isInCheckmate()) {
            setMsgAlert("CHECKMATE");
        } else if (game.isInStalemate()) {
            setMsgAlert("STALEMATE");
        } else if (game.isThreefoldRepetition()) {
            setMsgAlert("DRAW BY THREEFOLD REPETITION");
        } else if (game.isInsufficientMaterial()) {
            setMsgAlert("DRAW BY INSUFFICIENT MATERIAL");
        } else if (game.isDraw()) {
            setMsgAlert("DRAW BY 50 MOVE RULE");
        } else if (game.isInCheck()) {
            setMsgAlert("CHECK");
        } else {
            setMsgAlert("");
        }

        // Handle fused pieces and their display on the board
        const fused = Object.entries(game.positions[1]).concat(Object.entries(game.positions[3]));
        let edits = {};
        if (fused.length > 0) {
            for (let i = 0; i < fused.length; i++) {
                // Check if the fused piece is missing on the board as well
                const colour = game.get(fused[i][0] as Square).color;
                if (!colour && fused[i][0] !== "wK" && fused[i][0] !== "bK") {
                    game.reportMissingFusedPiece(fused[i][0] as Square);
                    continue;
                }
                // King will be represented as a colour not a piece
                if (fused[i][0] === "wK" || fused[i][0] === "bK") {
                    edits = {
                        ...edits,
                        [game.findKing(fused[i][0][0] as Color)]: {
                            backgroundImage: `url(/assets/pieces/${fused[i][0][0]}${fused[i][1].toUpperCase()}.png)`,
                            backgroundSize: "contain",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "left 25px center",
                        },
                    };
                } else {
                    edits = {
                        ...edits,
                        [fused[i][0]]: {
                            backgroundImage: `url(/assets/pieces/${colour}${fused[i][1].toUpperCase()}.png)`,
                            backgroundSize: "contain",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "left 25px center",
                        },
                    };
                }
            }
        }
        setFusedDisplay(edits);
    }, [fen]);

    // Rate limit the rate an undo can be performed to prevent Stockfish from crashing the browser
    const handleUndoClick = () => {
        // Check if a timeout is already running
        if (timeoutRef.current !== null) {
            return;
        }
        // Set a timeout of 250ms before calling undoMove
        timeoutRef.current = setTimeout(() => {
            game.undoMove();
            setFen(game.fen());
            setIsClicked(null);
            timeoutRef.current = null;
        }, 250);
    };

    // Enable random moves to be played by the computer
    // The available moves will be debugged to console, and these moves will pause intermitently
    // useEffect(() => {
    //     if (game.isGameOver()) return;
    //     const allMoves = game.getEveryMove();
    //     console.debug(allMoves);
    //     if (allMoves.length === 0) return;
    //     const randomMove = allMoves[Math.floor(Math.random() * allMoves.length)];
    //     onDrop(randomMove.slice(0, 2) as Square, randomMove.slice(-2) as Square);
    // }, [fen]);

    // Log every possible move to console
    // useEffect(() => {
    //     if (game.isGameOver()) return;
    //     const allMoves = game.getEveryMove();
    //     console.debug(allMoves);
    // }, [fen]);

    return (
        <div className="container">
            <img src="/cdotcom.png" id="bg" alt="Background" />
            <div className="board">
                <Chessboard
                    position={fen}
                    onPieceDrop={onDrop}
                    onSquareClick={onClick}
                    onSquareRightClick={onRightClick}
                    id="board"
                    boardWidth={boardWidth}
                    onMouseOverSquare={onHover}
                    onMouseOutSquare={onHoverLeave}
                    customSquareStyles={{ ...fusedDisplay, ...squareAttributes, ...rightClicked }}
                    customBoardStyle={{ borderRadius: "10px" }}
                    customPieces={customPieces()}
                />
            </div>
            <div className="left">
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "12px" }}>
                    <img src="/fchess.png" style={{ width: "50px", height: "50px" }} />
                    <h1 className="title">Fusion Chess</h1>
                </div>
                <h3 style={{ color: "white", marginTop: "-10px" }}>
                    <a style={{ color: "#4db2ff" }} href="https://github.com/bubner/" target="_blank" rel="noreferrer">
                        Lucas Bubner
                    </a>
                    , 2023
                </h3>
                <button
                    id="reset"
                    onClick={() => {
                        if (!window.confirm("Confirm reset?")) return;
                        reset();
                    }}
                >
                    Reset
                </button>
                <button onClick={handleUndoClick}>
                    Undo
                </button>
                <br />
                <button onClick={exportGame}>
                    Export
                </button>
                <button onClick={importGame}>
                    Import
                </button>
                <br />
                <button onClick={() => setIsStockfishOn(!isStockfishOn)}>
                    Toggle Stockfish
                </button>
                <br />
                <button
                    id="start"
                    style={{
                        border: "2px solid lightgreen",
                        display: isGameStarted ? "none" : "revert",
                        backgroundColor: "green",
                    }}
                    onClick={start}
                >
                    Start
                </button>
                <p id="alert" className="center">
                    {msgAlert}
                </p>
            </div>
            <div className="middle">
                <p className="title">Fused</p>
                <p className="history">
                    {game.positions[1] && Object.keys(game.positions[1]).length > 0 ? (
                        Object.entries(game.positions[1]).map((position, index) => {
                            return (
                                <Fragment key={index}>
                                    {position.slice(0, 1)}={position.slice(-1).toString().substring(1)}
                                    {position.slice(-1).toString().substring(0, 1).toUpperCase()}{" "}
                                </Fragment>
                            );
                        })
                    ) : (
                        <>No standard pieces have been fused.</>
                    )}
                    {game.positions[3] &&
                        Object.keys(game.positions[3]).length > 0 &&
                        Object.entries(game.positions[3]).map((position, index) => {
                            return (
                                <Fragment key={index}>
                                    <br />
                                    {position.slice(0, 1)}={position.slice(-1)}
                                </Fragment>
                            );
                        })}
                </p>
            </div>
            <div className="bottom">
                <p className="title">History</p>
                <p className="history">
                    {Object.entries(game.getHistory()).length > 0 ? (
                        Object.entries(game.getHistory()).map((data, index) => {
                            return (
                                <Fragment key={index}>
                                    {index % 2 === 0 ? index / 2 + 1 + "." : null}
                                    {data[1].fsan}{" "}
                                </Fragment>
                            );
                        })
                    ) : (
                        <>No moves have been made.</>
                    )}
                </p>
            </div>
            {isStockfishOn &&
                <Stockfish
                    fen={isGameStarted ? fen : null}
                    vfen={isGameStarted ? game.positions[2] : ""}
                    depth={18}
                    shouldRun={!game.isGameOver()}
                />
            }
        </div>
    );
}

export default App;
