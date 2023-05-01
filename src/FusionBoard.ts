import { Chess, Square, PieceSymbol, SQUARES, Move, Color } from "chess.js/src/chess";
/**
 * Fusion chess board implementation
 * @author Lucas Bubner, 2023
 */
export default class FusionBoard extends Chess {
    // Extending from the Chess class allows us to use the same implementation mechanics of normal chess
    // This allows us to use the same movePiece function and other functions that are already implemented

    #fused: Record<string, string>;
    #king_fused: Record<Color, string>;
    #virtual_board: Chess;

    constructor() {
        super();
        // Initialise an empty fused board positions
        this.#fused = {};
        this.#king_fused = { w: "", b: "" };
        // Initialise a virtual board to check for valid moves
        this.#virtual_board = new Chess();
    }

    movePiece(movefrom: Square, moveto: Square): Move | false {
        // Get the target square of the move
        const targetsquare = this.get(moveto);
        const sourcesquare = this.get(movefrom);
        // Move on the primary board and return the result
        try {
            const move = this.move({
                from: movefrom,
                to: moveto,
                promotion: "q",
            });

            // Check if the move was a capture, if so, get the type piece on that square
            if (targetsquare) {
                // Do not fuse pieces of the same type
                if (sourcesquare.type === targetsquare.type) {
                    return move;
                }

                // Special logic for king fusion, as we cannot replace the kings on the board
                if (sourcesquare.type === "k") {
                    // Assign special fusion to the king
                    this.#king_fused[sourcesquare.color] = targetsquare.type;
                    return move;
                }

                // If it is already fused, then delete it from the fused board
                if (this.#fused[moveto]) {
                    delete this.#fused[moveto];
                }
                if (this.#fused[movefrom]) {
                    delete this.#fused[movefrom];
                }

                // Add the captured piece to the fused board
                this.#fused[moveto] = targetsquare.type;
            }

            // Update movement of any pieces that have been fused
            for (const [square, piece] of Object.entries(this.#fused)) {
                // Check if the piece is on the same square as the move
                if (square === movefrom) {
                    // Remove the piece from the fused board
                    delete this.#fused[square];
                    // Add the piece to the new square
                    this.#fused[moveto] = piece;
                }
            }

            // Return to the primary board after fusion procedure has completed
            return move;
        } catch (e) {
            // If the move was allegedly invalid, then try again but on a virtual board
            this._updateVirtualBoard();
            // Try to move on the virtual board
            try {
                const move = this.#virtual_board.move({
                    from: movefrom,
                    to: moveto,
                    promotion: "q",
                });
                // Make sure we aren't blundering the king
                if (this.#virtual_board.isCheck() || this.isCheck()) {
                    return false;
                }
                // If the move is valid, then continue the move forcefully
                if (move) {
                    const originalState = new Chess(this.fen());
                    // Force move on the primary board by updating it's FEN
                    this.load(this.#virtual_board.fen());
                    // Change the piece identifier to the inverse, as they will be replaced
                    this.#fused[movefrom] = originalState.get(movefrom).type;
                    // Update movement of any pieces that have been fused
                    for (const [square, piece] of Object.entries(this.#fused)) {
                        // Check if the piece is on the same square as the move
                        if (square === movefrom) {
                            // Remove the piece from the fused board
                            delete this.#fused[square];
                            // Add the piece to the new square
                            this.#fused[moveto] = piece;
                        } else if (square !== moveto) {
                            // For fused pieces that are not affected by this move, we need to
                            // update them back to their original state as they likely were mutated
                            this.put(
                                {
                                    type: originalState.get(square as Square).type,
                                    color: originalState.get(square as Square).color,
                                },
                                square as Square
                            );
                        }
                    }
                }
                return move;
            } catch (e) {
                // If the move is still invalid, then return false
                return false;
            }
        }
    }

    get positions(): [string, Record<string, string>, string] {
        this._updateVirtualBoard();
        return [this.fen(), this.#fused, this.#virtual_board.fen()];
    }

    set fused(fused: string[]) {
        for (const piece of fused) {
            if (!piece) continue;
            const [square, pieceName] = piece.split("=");
            this.#fused[square] = pieceName.toLowerCase();
        }
        this._updateVirtualBoard();
    }

    reset() {
        super.reset();
        this.#fused = {};
    }

    undo() {
        // Change the current state to the previous one in the history
        const undoAction = super.undo();
        if (!undoAction) return undoAction;

        // Undo any fused pieces that were attained in the previous move
        // this.#fused_history.pop();
        // this.#fused = this.#fused_history[-1];

        return undoAction;
    }

    // Overloads matching chess.js
    history(): string[];
    history({ verbose }: { verbose: true }): (Move & { fen: string })[];
    history({ verbose }: { verbose: false }): string[];
    history({ verbose }: { verbose: boolean }): string[] | (Move & { fen: string })[];
    history({ verbose = false }: { verbose?: boolean } = {}) {
        // Obtain history with a super method
        const history = super.history({ verbose });
        return history;
    }

    getFusedMoves(fused: Array<string>, hovering: string): string[] {
        this._updateVirtualBoard();
        // console.log("current state of the virtual board\n", this.#virtual_board.ascii());
        // Get the moves for the current fused pieces
        const moves = this.#virtual_board.moves({ square: fused[0] as Square, verbose: true });
        // Filter the moves to only include the moves that are valid for the current fused pieces
        const filteredMoves = moves.filter((move) => {
            if (this.#virtual_board.isCheck()) {
                // Make another virtual copy of the board
                const copy = new Chess(this.#virtual_board.fen());
                // Make the move on the virtual board by force
                copy.put({ type: copy.get(move.from).type, color: copy.get(move.from).color }, move.to);
                // Check if the move is valid by determining if it puts the king in jeopardy
                if (copy.isCheck()) {
                    // If the move is invalid, then filter it out
                    return false;
                }
            }
            // Check if the move is a capture
            if (move.captured) {
                // Check if the captured piece is in the fused pieces
                if (fused.includes(move.captured)) {
                    // Check if the piece is not the piece that is currently being hovered
                    if (move.captured !== hovering) {
                        // If the piece is not the piece that is currently being hovered, then the move is valid
                        return true;
                    }
                }
            }
            // If the move is not a capture, then it is valid
            return true;
        });
        // Return the filtered moves in UCI format
        return filteredMoves.map((move) => move.from + move.to);
    }

    private _updateVirtualBoard() {
        // Update the virtual board to reflect the current fused pieces
        this.#virtual_board.load(this.fen());
        for (const [square, piece] of Object.entries(this.#fused)) {
            this.#virtual_board.put(
                { type: piece as PieceSymbol, color: this.get(square as Square).color },
                square as Square
            );
        }
    }

    isCheckmate() {
        this._updateVirtualBoard();
        const king = this.findKing();
        return (
            super.isCheckmate() ||
            (this.#virtual_board.isCheck() &&
                this.#virtual_board.moves({ square: king }).length === 0 &&
                !this.#virtual_board.isAttacked(this.findChecker()!, this.turn()) &&
                this._cannotBlockMate(king!))
        );
    }

    _cannotBlockMate(king: Square) {
        let moves;
        if (this.isCheck()) {
            moves = this.moves().concat(this.#virtual_board.moves({ square: king, verbose: false }));
        } else {
            moves = this.moves({ square: king, verbose: false }).concat(this.#virtual_board.moves());
        }
        return moves.length === 0;
    }

    findKing(): Square | undefined {
        for (const square of SQUARES) {
            const piece = this.get(square);
            if (piece && piece.type === "k" && piece.color === this.turn()) {
                return square as Square;
            }
        }
        return undefined;
    }

    findChecker(): Square | undefined {
        // Scan every square for a square that is checking the king
        for (const square of SQUARES) {
            const piece = this.get(square);
            if (piece && piece.color !== this.turn()) {
                // Get the moves for the piece
                const moves = this.moves({ square: square as Square, verbose: true });
                // Check if the moves include the king
                for (const move of moves) {
                    if (move.to.includes(this.findKing() as string)) {
                        return square as Square;
                    }
                }
            }
        }
        return undefined;
    }

    isStalemate() {
        this._updateVirtualBoard();
        return (
            super.isStalemate() &&
            !this.#virtual_board.isCheck() &&
            this.moves({ square: this.findKing() }).length === 0
        );
    }

    isCheck() {
        this._updateVirtualBoard();
        return super.isCheck() || this.#virtual_board.isCheck();
    }

    isGameOver() {
        this._updateVirtualBoard();
        return super.isGameOver() || this.isCheckmate() || this.isStalemate();
    }
}

export const PIECES = ["p", "n", "b", "r", "q", "k"];
