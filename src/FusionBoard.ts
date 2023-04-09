import { Chess, Square, PieceSymbol, SQUARES, Move } from "chess.js/src/chess";
/**
 * Fusion chess board implementation
 * @author Lucas Bubner, 2023
 */
export default class FusionBoard extends Chess {
    // Extending from the Chess class allows us to use the same implementation mechanics of normal chess
    // This allows us to use the same movePiece function and other functions that are already implemented

    #fused: Record<string, string>;
    #fused_history: Array<Record<Square, string>>;
    #history_capture: string[];
    #virtual_board: Chess;

    constructor() {
        super();
        // Initialise an empty fused board positions
        this.#fused = {};
        // Initialise an empty fused board history
        this.#fused_history = [];
        this.#history_capture = [];
        // Initialise a virtual board to check for valid moves
        this.#virtual_board = new Chess();
    }

    movePiece(movefrom: Square, moveto: Square): Move | false {
        // Get the target square of the move
        const targetsquare = this.get(moveto);
        // Move on the primary board and return the result
        try {
            // Try on the virtual board first, as we might be missing info regarding check states
            this._updateVirtualBoard();

            // Try to move on the virtual board
            try {
                this.#virtual_board.move({
                    from: movefrom,
                    to: moveto,
                    promotion: "q",
                });
            } catch (e) {
                if (this.#virtual_board.get(movefrom).type === "k" && this.#virtual_board.isCheck() && this.isCheck()) {
                    // Cancel if the move was illegal and it was a king movement as it was check
                    return false;
                }
            }

            const move = this.move({
                from: movefrom,
                to: moveto,
                promotion: "q",
            });

            // Check if the move was a capture, if so, get the type piece on that square
            if (targetsquare) {
                // Was it a pawn takes pawn capture? Don't fuse pawns together
                if (this.get(movefrom).type === "p" && targetsquare.type === "p") {
                    return move;
                }
                // Check if the piece capturing is the king, we need to run special logic for that
                if (this.get(movefrom).type === "k") {
                    // here be pirates, run some check detections here.
                    return move;
                }
                // Before fusing, update a history snapshot of the fused board
                this.#history_capture = this.history();
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

            // Update history by deep copying the current fused board
            this.#fused_history.push(JSON.parse(JSON.stringify(this.#fused)));

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
                // If the move is valid, then continue the move forcefully
                if (move) {
                    // Make a copy of the primary board
                    const copy = new Chess(this.fen());
                    // Update FEN of the primary board to reflect the virtual board
                    this.load(this.#virtual_board.fen());
                    // Remove the piece from the primary board
                    this.remove(movefrom);
                    // Change the piece identifier to the inverse, as they will be replaced
                    this.#fused[movefrom] = copy.get(movefrom).type;
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
                }
                return move;
            } catch (e) {
                // If the move is still invalid, then return false
                return false;
            }
        }
    }

    get positions(): [string, Record<string, string>] {
        return [this.fen(), this.#fused];
    }

    reset() {
        super.reset();
        this.#fused = {};
        this.#fused_history = [];
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
        if (history.length === 0) {
            // Check if it was the first move
            if (this.#fused_history.length === 0) {
                return history;
            }
            // Otherwise a fusion has occurred, undo the last move
            this.undo();
            // Get the history of the board
            const oldhistory = super.history({ verbose });
            // Redo the last move
            // this.move(history[history.length - 1]);
            // Return the histories combined
            return [...oldhistory, ...history];
        }
        // Standard move, continue as normal
        return history;
    }

    getFusedMoves(fused: Array<string>, hovering: string): string[] {
        this._updateVirtualBoard();
        // console.log("current state of the virtual board\n", this.#virtual_board.ascii());
        // Get the moves for the current fused pieces
        const moves = this.#virtual_board.moves({ square: <Square>fused[0], verbose: true });
        // Filter the moves to only include the moves that are valid for the current fused pieces
        const filteredMoves = moves.filter((move) => {
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
        // Return the filtered moves
        return filteredMoves.map((move) => move.from + move.to);
    }

    private _updateVirtualBoard() {
        // Update the virtual board to reflect the current fused pieces
        this.#virtual_board.load(this.fen());
        for (const [square, piece] of Object.entries(this.#fused)) {
            // Ensure pieces that are fused actually exist on the board
            // if (this.get(<Square> square)) {
            //     // Remove piece
            //     delete this.#fused[square];
            //     continue;
            // }
            this.#virtual_board.put(
                { type: <PieceSymbol>piece, color: this.get(<Square>square).color },
                <Square>square
            );
        }
    }

    isCheckmate() {
        this._updateVirtualBoard();
        return (
            super.isCheckmate() ||
            (this.#virtual_board.isCheck() &&
                this.moves({ square: this.findKing() }).length === 0 &&
                !this.isAttacked(this.findChecker()!, this.turn()) &&
                this._cannotBlockMate())
        );
    }

    _cannotBlockMate() {
        const moves = this.moves().concat(this.#virtual_board.moves());
        return moves.length === 0;
    }

    findKing(): Square | undefined {
        for (const square of SQUARES) {
            const piece = this.get(square);
            if (piece && piece.type === "k" && piece.color === this.turn()) {
                return <Square>square;
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
                const moves = this.moves({ square: <Square>square });
                // Check if the moves include the king
                if (moves.includes(this.findKing() as string)) {
                    return <Square>square;
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
