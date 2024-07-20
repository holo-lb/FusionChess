import { Chess, Square, PieceSymbol, Move, Color, SQUARES, DEFAULT_POSITION, validateFen } from "chess.js/src/chess";

/**
 * Function board with additional methods for board state analysis.
 * Extends from chess.js to provide all standard chess functionality.
 * @extends Chess
 */
class ChessBoard extends Chess {
    constructor(fen: string) {
        super(fen);
    }

    // Check if the king square is attacked by a colour
    findKing(colour: Color): Square {
        for (const square of SQUARES) {
            const piece = this.get(square);
            if (piece && piece.type === "k" && piece.color === colour) {
                return square as Square;
            }
        }
        throw new Error(`Unable to find ${colour} king.`);
    }

    // Check if the king square is attacked by a colour
    kingBeingAttacked(colour: Color): boolean {
        return this.isAttacked(this.findKing(colour), colour === "w" ? "b" : "w");
    }

    // Return inverse turn
    opponent() {
        return this.turn() === "w" ? "b" : "w";
    }
}

/**
 * Fusion chess board implementation
 * @author Lucas Bubner, 2023
 */
export default class FusionBoard extends ChessBoard {
    // Extending from the Chess class allows us to use the same implementation mechanics of normal chess
    // This allows us to use the same movePiece function and other functions that are already implemented

    #fused: Record<string, string>;
    #king_fused: Record<string, string>;
    #history: Array<Record<string, string>>;
    #virtual_board: Chess;

    constructor() {
        super(DEFAULT_POSITION);
        this.#history = [];
        // Initialise an empty fused board positions
        this.#fused = {};
        this.#king_fused = {};
        // Initialise a virtual board to check for valid moves
        this.#virtual_board = new Chess();
    }

    movePiece(movefrom: Square, moveto: Square): Move | false {
        // Get the target square of the move
        const targetsquare = this.get(moveto);
        const sourcesquare = this.get(movefrom);
        this._updateVirtualBoard();
        const vTargetSquare = this.#virtual_board.get(moveto);
        const vSourceSquare = this.#virtual_board.get(movefrom);
        if (this._willJeopardiseKing(movefrom, moveto)) {
            return false;
        }

        const updateHistory = (move: Move) => {
            // Update history of all boards by appending this move to the history record
            const ffen = this.export();
            const fsan = this._convertToFusionSAN(move);
            this.#history.push({
                fsan,
                ffen,
            });
        };

        const updateMovement = () => {
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
            this._updateVirtualBoard();
        };

        const sourcePieceIs = (identifier: string) => {
            return (
                (sourcesquare.type === identifier || vSourceSquare.type === identifier) &&
                pickStrongerPiece(vSourceSquare.type, sourcesquare.type) === identifier
            );
        };

        const targetPieceIs = (identifier: string) => {
            return (
                (targetsquare.type === identifier || vTargetSquare.type === identifier) &&
                pickStrongerPiece(vTargetSquare.type, targetsquare.type) === identifier
            );
        };

        const pickStrongerPiece = (piece1: PieceSymbol, piece2: PieceSymbol) => {
            const piece1value = this._getPieceValue(piece1);
            const piece2value = this._getPieceValue(piece2);
            return piece1value >= piece2value ? piece1 : piece2;
        };

        // Move on the primary board and return the result
        try {
            const move = this.move({
                from: movefrom,
                to: moveto,
                promotion: "q",
            });

            // Check if the move was a capture, if so, get the type piece on that square
            if (targetsquare) {
                // Special logic for king fusion, as we cannot replace the kings on the board
                if (sourcesquare.type === "k") {
                    // Remove all standard fusion on that square
                    delete this.#fused[moveto];

                    // Do not fuse with pawns, and if we have a queen, don't fuse with anything
                    // Knight-queen-king is not possible to obtain as it would be impossible to checkmate, and the virtual board cannot support two fusions.
                    if (targetPieceIs("p") || this.#king_fused[sourcesquare.color + "K"] === "q") {
                        updateMovement();
                        updateHistory(move);
                        return move;
                    }

                    // Assign special fusion to the king
                    this.#king_fused[sourcesquare.color + "K"] = pickStrongerPiece(
                        targetsquare.type,
                        vTargetSquare.type
                    );
                    updateHistory(move);
                    return move;
                }

                // Do not fuse pieces of the same type
                if (
                    sourcesquare.type === targetsquare.type ||
                    vSourceSquare.type === vTargetSquare.type ||
                    (sourcePieceIs("q") && ((targetPieceIs("r") || targetPieceIs("b") || (targetPieceIs("p")) && !targetPieceIs("n"))))
                ) {
                    updateMovement();
                    updateHistory(move);
                    return move;
                }

                // Special fusion on rook and bishop
                if ((sourcePieceIs("r") && targetPieceIs("b")) || (sourcePieceIs("b") && targetPieceIs("r"))) {
                    // Replace target square with queen
                    this.put({ type: "q", color: sourcesquare.color }, moveto);

                    // Remove all original fusion on both squares
                    delete this.#fused[movefrom];
                    delete this.#fused[moveto];

                    // I really don't know why this makes it work, but it does
                    this.load(this.fen());
                    updateHistory(move);
                    return move;
                }

                // Delete any original fusion
                delete this.#fused[moveto];
                delete this.#fused[movefrom];

                // Add the captured piece to the fused board
                if (sourcePieceIs("q") && targetPieceIs("n")) {
                    // Special case for queen-knight fusion. ensuring it always activates on knights only
                    this.#fused[moveto] = targetsquare.type === "q" ? "q" : "n";
                } else {
                    const chosenPiece = pickStrongerPiece(targetsquare.type, vTargetSquare.type);
                    if (chosenPiece !== sourcesquare.type)
                        this.#fused[moveto] = chosenPiece;
                }
            }

            // Return to the primary board after fusion procedure has completed
            updateMovement();
            updateHistory(move);
            return move;
        } catch (e) {
            try {
                // Move is allegedly illegal, but the virtual board will not account for a fused king (due to the king being replaced)
                // This is a special case movement, meaning we have to run manual calculations. We run these before the actual virtual board calculations.
                if (sourcesquare.type === "k" && this.#king_fused[sourcesquare.color + "K"]) {
                    // Check if the target square is under attack
                    if (this.isAttacked(moveto, this.opponent())) {
                        return false;
                    }

                    const copy = new Chess(this.fen());
                    // Test to see if the king is being xrayed
                    copy.remove(movefrom);
                    copy.put({ type: "k", color: sourcesquare.color }, moveto);
                    if (copy.isAttacked(moveto, this.opponent())) {
                        return false;
                    }
                    copy.load(this.fen());
                    // Force replace the king on the board
                    copy.remove(movefrom);
                    copy.put(
                        { type: this.#king_fused[sourcesquare.color + "K"] as PieceSymbol, color: sourcesquare.color },
                        movefrom
                    );

                    this._fixMissingKing(copy);

                    // Make movement with new piece
                    let move: Move | boolean = false;
                    try {
                        move = copy.move({
                            from: movefrom,
                            to: moveto,
                            promotion: "q",
                        });
                    } catch (e) {
                        // Invalid move
                        return false;
                    }
                    if (!move) return false;

                    // Force move on primary board by teleporting the king
                    this.remove(movefrom);
                    // King fused piece position will update automatically
                    this.put({ type: "k", color: sourcesquare.color }, moveto);

                    // Force change the turn
                    const fen = this.fen();
                    const fenPieces = fen.split(" ");
                    fenPieces[1] = fenPieces[1] === "w" ? "b" : "w";
                    this.load(fenPieces.join(" "));

                    updateHistory(move);
                    return move;
                } else {
                    throw new SafeError("not a king movement");
                }
            } catch (e) {
                // Make sure we aren't blundering the king
                const copy = new ChessBoard(this.fen());
                copy.remove(movefrom);
                copy.put({ type: sourcesquare.type, color: sourcesquare.color }, moveto);
                // Check if our king is under attack, if it is, then it is an illegal move
                if (copy.kingBeingAttacked(this.turn())) {
                    return false;
                }

                // Check for castling, if we are trying to castle but it failed by the main board, then it has to be illegal.
                if (
                    ((movefrom === "e1" && moveto === "g1") ||
                        (movefrom === "e1" && moveto === "c1") ||
                        (movefrom === "e8" && moveto === "g8") ||
                        (movefrom === "e8" && moveto === "c8")) &&
                    this.get(movefrom).type === "k"
                ) {
                    return false;
                }

                let move: Move | boolean = false;
                try {
                    move = this.#virtual_board.move({
                        from: movefrom,
                        to: moveto,
                        promotion: "q",
                    });
                } catch (e) {
                    return false;
                }
                // If the move is valid, then continue the move forcefully
                if (move) {
                    copy.load(this.fen());
                    // Force move on the primary board by updating it's FEN
                    this.load(this.#virtual_board.fen());
                    // Change the piece identifier to the inverse, as they will be replaced
                    if (sourcesquare.type !== "k") this.#fused[movefrom] = copy.get(movefrom).type;
                    // Update movement of any pieces that have been fused
                    for (const [square, piece] of Object.entries(this.#fused)) {
                        // Check if the piece is on the same square as the move
                        if (square === movefrom) {
                            // Remove the piece from the fused board
                            delete this.#fused[square];
                            if (sourcePieceIs("q") && (sourcesquare.type === "n" || vSourceSquare.type === "n")) {
                                // Do not fuse queen-knight fusions
                                this.#fused[moveto] = sourcesquare.type === "q" ? "q" : "n";
                                continue;
                            }
                            // Add the piece to the new square
                            let shouldFuse = pickStrongerPiece(piece as PieceSymbol, targetsquare.type);
                            shouldFuse = pickStrongerPiece(shouldFuse, vTargetSquare.type);
                            // Don't fuse pieces that are the same
                            if (shouldFuse === vSourceSquare.type)
                                continue;
                            this.#fused[moveto] = shouldFuse;
                        } else if (square !== moveto) {
                            // For fused pieces that are not affected by this move, we need to
                            // update them back to their original state as they likely were mutated
                            this.put(
                                {
                                    type: copy.get(square as Square).type,
                                    color: copy.get(square as Square).color,
                                },
                                square as Square
                            );
                        }
                    }
                }
                this._updateVirtualBoard();
                updateHistory(move);
                return move;
            }
        }
    }

    /**
     * 0: FEN of the primary board
     * 1: Fused pieces
     * 2: FEN of the virtual board
     * 3: Pieces fused at the king's position
     */
    get positions(): [string, Record<string, string>, string, Record<Color, string>] {
        return [this.fen(), this.#fused, this.#virtual_board.fen(), this.#king_fused];
    }

    set fused(fused: string[]) {
        this.#fused = {};
        for (const piece of fused) {
            if (!piece) continue;
            const [square, pieceName] = piece.split("=");
            if (square === "wK" || square === "bK") continue;
            this.#fused[square] = pieceName.toLowerCase();
        }
        this._updateVirtualBoard();
    }

    set king_fused(fused: string[]) {
        for (const piece of fused) {
            if (!piece) continue;

            const [color, pieceName] = piece.split("=");
            this.#king_fused[color] = pieceName.toLowerCase();
        }
    }

    reset() {
        super.reset();
        this.#fused = {};
        this.#king_fused = {};
        this.#history = [];
        this._updateVirtualBoard();
    }

    // Choosing not to override the original method as it is not necessary
    undoMove() {
        // Remove last move from history
        this.#history.pop();

        // Reset the game if we run out of history
        if (this.#history.length === 0) {
            this.reset();
            return;
        }

        // Load the previous position
        this.import(
            // Remove any trailing whitespace from the fen and load it
            this.#history[this.#history.length - 1].ffen.replace(/^\s+|\s+$/g, "")
        );
    }

    getHistory(): Array<Record<string, string>> {
        return this.#history;
    }

    moves(): string[];
    moves({ square }: { square: Square }): string[];
    moves({ verbose, square }: { verbose: true; square?: Square }): Move[];
    moves({ verbose, square }: { verbose: false; square?: Square }): string[];
    moves({ verbose, square }: { verbose?: boolean; square?: Square }): string[] | Move[];
    moves({ verbose = false, square = undefined }: { verbose?: boolean; square?: Square } = {}) {
        // Get the moves that chess.ts would normally return, and run additional filtering for fusion positions
        const moves = (super.moves({ verbose, square }) as Array<string | Move>).filter((move: Move | string) => {
            if (verbose && typeof move === "object") {
                if (this._willJeopardiseKing(move.from, move.to)) {
                    return false;
                }
            } else {
                // SAN strings are not implemented because we cannot extract source square data easily, which is required
                // for checking specific game states. This is because the SAN string does not contain the source square.
                throw new Error("san strings are not currently implemented");
            }
            return true;
        });

        return verbose ? (moves as Move[]) : (moves as string[]);
    }

    _getPieceValue(piece: PieceSymbol) {
        switch (piece) {
            case "k":
                return 1000;
            case "q":
                return 9;
            case "r":
                return 5;
            case "b":
                return 3;
            case "n":
                return 3;
            case "p":
                return 1;
            default:
                return 0;
        }
    }

    _willJeopardiseKing(movefrom: string, moveto: string, iteration: string | false = false): boolean {
        this._updateVirtualBoard();

        // PASS: king legal move test: rnb5/pp1k3p/2p1r1p1/8/5n2/8/PPPPB1PP/RNBQK1NR w - - 0 13 f4=q,
        // PASS: king fusion movement test: 8/pp1K1k1p/6p1/2p5/3P4/8/PPP4P/RN4NR b - - 4 36 wK=r,
        // PASS: king fusion check test: rBb5/pp2k2p/6p1/2p5/8/3P4/PPP4P/RN2K1NR b - - 11 27 b8=n,wK=r,

        // Use extended Chess class
        const copy = new ChessBoard(iteration ? iteration : this.#virtual_board.fen());
        // Whenever we run this function, run it once again with recursion to ensure we have checked the normal board too
        const recursiveAction = iteration ? false : this._willJeopardiseKing(movefrom, moveto, this.fen());

        // Check for castling
        if (
            ((movefrom === "e1" && moveto === "g1") ||
                (movefrom === "e1" && moveto === "c1") ||
                (movefrom === "e8" && moveto === "g8") ||
                (movefrom === "e8" && moveto === "c8")) &&
            this.#virtual_board.get(movefrom).type === "k"
        ) {
            if (this.isInCheck()) return true;
            copy.remove(movefrom as Square);
            let willFusedKingInterfere = false;
            // Check if the king moves through check, and also check if a fused king is attacking castling squares
            switch (moveto) {
                case "g1":
                    copy.put({ type: "k", color: "w" }, "f1");
                    willFusedKingInterfere = this.isKingChecking(movefrom, "f1");
                    break;
                case "g8":
                    copy.put({ type: "k", color: "b" }, "f8");
                    willFusedKingInterfere = this.isKingChecking(movefrom, "f8");
                    break;
                case "c1":
                    copy.put({ type: "k", color: "w" }, "d1");
                    willFusedKingInterfere = this.isKingChecking(movefrom, "d1");
                    break;
                case "c8":
                    copy.put({ type: "k", color: "b" }, "d8");
                    willFusedKingInterfere = this.isKingChecking(movefrom, "d8");
                    break;
            }
            return copy.isCheck() || willFusedKingInterfere || this.isKingChecking(movefrom, moveto) || recursiveAction;
        }

        try {
            // Check if the move will put the king in jeopardy by forcing the move on the board
            const target = copy.get(movefrom as Square);
            copy.remove(movefrom as Square);
            copy.put({ type: target.type, color: target.color }, moveto as Square);

            if (copy.kingBeingAttacked(copy.turn()) || this.isKingChecking(movefrom, moveto)) {
                throw new SafeError("king is in jeopardy");
            }
        } catch (e) {
            if (e instanceof SafeError) {
                return true;
            }
        }

        return false || recursiveAction;
    }

    isKingChecking(movefrom?: string, moveto?: string): boolean {
        if (this.#king_fused[`${this.opponent()}K`]) {
            // Make sure that the opponent's king is not in check
            const opponentking = this.findKing(this.opponent());
            const copy = new Chess(this.fen());
            if (movefrom) {
                // Force move on the board as it will register as an invalid move.
                // We do not have to worry about the actual validity as the calling function will already confirm legality
                const origin = copy.get(movefrom as Square);
                copy.remove(movefrom as Square);
                if (origin)
                    copy.put(origin, moveto as Square);
            }
            copy.remove(opponentking as Square);
            copy.put(
                {
                    type: this.#king_fused[`${this.opponent()}K`] as PieceSymbol,
                    color: this.opponent(),
                },
                opponentking as Square
            );

            return copy.isCheck();
        }
        return false;
    }

    _getKingFusedMoves(): string[] {
        // Make a new copy of the entire board, accounting for virtual positions
        const copy = new FusionBoard();
        copy.load(this.fen());
        copy.#fused = this.#fused;
        copy._updateVirtualBoard();

        if (!this.#king_fused[`${this.turn()}K`]) {
            return [];
        }

        const king = this.findKing(this.turn());
        // Replace king with the fused piece
        copy.remove(king as Square);
        copy.put(
            {
                type: this.#king_fused[`${this.turn()}K`] as PieceSymbol,
                color: this.turn(),
            },
            king as Square
        );

        this._fixMissingKing(copy);

        // Get the moves for the king
        const swappedMoves = copy.moves({ square: king, verbose: true });

        // Filter the moves to only include the moves that are valid for the current fused pieces
        const runningCopy = new Chess(this.fen());
        const filteredMoves = swappedMoves.filter((move) => {
            // Move the king first in a simulation
            runningCopy.remove(king as Square);
            runningCopy.put({ type: "k", color: this.opponent() }, move.to as Square);
            if (runningCopy.isAttacked(move.to, this.opponent())) {
                return false;
            } else {
                runningCopy.load(this.fen());
            }
            // Check if the square is endangered
            if (copy.isAttacked(move.to, copy.opponent())) {
                return false;
            }
            return true;
        });
        // Return the moves
        return filteredMoves.map((move) => move.from + move.to);
    }

    getFusedMoves(fused: Array<string>, hovering: string): string[] {
        const target = this.get(fused[0] as Square);
        if (target.type === "k" && target.color === this.turn()) {
            // Run simulations on king movement
            return this._getKingFusedMoves();
        }
        // Get the moves for the current fused pieces
        const moves = this.#virtual_board.moves({ square: fused[0] as Square, verbose: true });
        // Filter the moves to only include the moves that are valid for the current fused pieces
        const filteredMoves = moves.filter((move) => {
            if (this._willJeopardiseKing(move.from, move.to)) {
                return false;
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

    // Returns in UCI format an array of every possible move, including king fusion, standard fusion, and standard moves
    getEveryMove(): string[];
    getEveryMove(square?: Square): string[] {
        this._updateVirtualBoard();
        // Returns all possible moves for a given position, useful for any type of validating legal moves
        const mainBoard = this.moves({ square: square, verbose: true });
        const virtualBoard = this.#virtual_board.moves({ square: square, verbose: true });

        let kingFusion: string[] = [];
        if (this.#king_fused[`${this.turn()}K`]) {
            kingFusion = this._getKingFusedMoves();
        }

        // Congegrate all moves into one array
        const moves = [
            ...mainBoard.map((move) => move.from + move.to),
            ...virtualBoard.map((move) => move.from + move.to),
            ...kingFusion,
        ];

        // Moves are in UCI format
        const validMoves = moves.filter((move) => {
            return !(
                this._willJeopardiseKing(move.slice(0, 2), move.slice(2, 4)) ||
                this.isKingChecking(move.slice(0, 2), move.slice(2, 4))
            );
        });

        return validMoves;
    }

    // A fused piece might lose it's cohesion square in circumstances such as a king capture
    // or similar where there are multiple fused pieces. This function is called when a fused square is missing.
    reportMissingFusedPiece(iterator: Square) {
        delete this.#fused[iterator];
        this._updateVirtualBoard();
    }

    private _updateVirtualBoard() {
        // Update the virtual board to reflect the current fused pieces
        try {
            this.#virtual_board.load(this.fen());
            for (const [square, piece] of Object.entries(this.#fused)) {
                const squareData = this.get(square as Square);
                if (squareData.type === "k") {
                    // Do NOT at any cost replace the king. This will crash the game.
                    continue;
                }
                this.#virtual_board.put({ type: piece as PieceSymbol, color: squareData.color }, square as Square);
            }
        } catch (e) {
            console.error("Error updating virtual board", e);
        }
    }

    // Fix a copy board from complaining of a nonexistent king.
    // This is an incredibly crappy solution but chess.move() doesn't work without a king.
    // Lord forgive me for the lines I am about to write.
    private _fixMissingKing(copy: Chess) {
        // We need to put the king on the board to make a valid move so we're going to put it on the closest empty safe square
        // We invert the squares depending on the turn to avoid putting the king on the other side of the board
        // There is also a check to see if we pin ourselves by a nonexistent king, if so, we don't put the king on that square
        const boardSquares = this.turn() === "w" ? SQUARES.reverse() : SQUARES;

        const pinningOurselves = (putking: Square) => {
            // Yet Another Board Copy™
            const clone = new Chess(this.fen());

            // Put the king on the square we're testing
            clone.remove(this.findKing(this.turn()));
            clone.put({ type: "k", color: this.turn() }, putking);

            // Remove every other piece from the board that is our colour
            for (const square of SQUARES) {
                const piece = clone.get(square);
                if (piece && piece.color === this.turn() && piece.type !== "k") {
                    clone.remove(square);
                }
            }

            // Check if the king is in check, if so, we have pinned ourselves in some way
            return clone.isCheck();
        };

        for (const square of boardSquares) {
            if (
                !copy.get(square) &&
                !copy.isAttacked(square, copy.turn() === "w" ? "b" : "w") &&
                !pinningOurselves(square)
            ) {
                copy.put({ type: "k", color: this.turn() }, square as Square);
                return;
            }
        }
        // We'll have to settle for any square if they're all attacked for some reason. It should probably be check/stalemate at this point.
        copy.put({ type: "k", color: this.turn() }, SQUARES[Math.floor(Math.random() * SQUARES.length)] as Square);
        throw new Error("failed to find a safe square for king virtualisation");
    }

    isInStalemate() {
        return !this.isInCheck() && this.getEveryMove().length === 0;
    }

    // Cannot override isCheck, isStalemate, isCheckmate as it is used internally, causing a circular dependency
    isInCheck() {
        return this.isCheck() || this.#virtual_board.isCheck() || this.isKingChecking();
    }

    isInCheckmate() {
        return this.isInCheck() && this.getEveryMove().length === 0;
    }

    isDraw() {
        return super.isDraw() || this.isStalemate();
    }

    isInsufficientMaterial() {
        // Make sure not to call a draw for insufficient material if the king is fused
        // This may still be insufficient material, but 50-move rule should take care of it
        return super.isInsufficientMaterial() && Object.entries(this.#king_fused).length === 0;
    }

    isGameOver() {
        return this.isInCheckmate() || this.isDraw();
    }

    isAttacked(square: Square, colour: Color): boolean {
        return super.isAttacked(square, colour) || this.#virtual_board.isAttacked(square, colour);
    }

    private _convertToFusionSAN(move: Move): string {
        const primarySquare = this.get(move.to);
        const virtualSquare = this.#virtual_board.get(move.to);
        const isAVirtualMove = primarySquare.type !== virtualSquare.type;

        let virtualType: PieceSymbol = virtualSquare.type;
        if (primarySquare.type === "k" && this.#king_fused[`${move.color}K`]) {
            // Virtual square will not be represented on the virtual board
            // We need to get the virtual square from the king_fused record
            virtualType = this.#king_fused[`${move.color}K`] as PieceSymbol;
        }

        // If this is a stock move, we can use the normal SAN as it is not a fusion move
        if (!isAVirtualMove) return move.san;

        // Otherwise, fuse the two pieces in the form <main piece><virtual piece><captured?><to><check?>
        // prettier-ignore
        let fusionSAN = `${primarySquare.type.toUpperCase()}${virtualType.toUpperCase()}${move.captured ? "x" : ""}${move.to}`;

        // Add check or checkmate if applicable
        if (this.isInCheck()) {
            fusionSAN += this.isInCheckmate() ? "#" : "+";
        }

        return fusionSAN;
    }

    export() {
        // Collect game state
        const gameState = this.positions;

        // Turn fused pieces into a comma seperated string
        let fused = "";
        for (const [square, piece] of Object.entries({ ...gameState[1], ...gameState[3] })) {
            if (piece) fused += `${square}=${piece},`;
        }

        // Fuse together primary board fen and fused pieces
        return `${gameState[0]} ${fused}`;
    }

    import(e_string: string) {
        // Split string into their respective parts
        const e = e_string.split(" ");
        const fen = e_string[e_string.length - 1] === "," ? e.slice(0, e.length - 1).join(" ") : e_string;

        // Check FEN if it is valid, extracting all parts apart from the last
        const res = validateFen(fen);
        if (!res.ok) throw new Error(res.error);

        // Parse fused pieces
        const fusedPieces = e_string[e_string.length - 1] === "," ? e[e.length - 1].split(",") : [];

        // Check virtual FEN for validity
        if (fusedPieces.length > 0) {
            const virtualGame = new FusionBoard();
            virtualGame.load(fen);
            virtualGame.fused = fusedPieces;
            const virtualRes = validateFen(virtualGame.positions[2]);
            if (!virtualRes.ok) throw new Error(`virtual board :: ${virtualRes.error}`);
        }

        // Format is in square=PIECE, check if the squares and pieces are valid
        for (const piece of fusedPieces) {
            if (!piece) continue;
            const [square, pieceName] = piece.split("=");
            if (!SQUARES.includes(square as Square) || !PIECES.includes(pieceName.toLowerCase())) {
                if (square === "bK" || square === "wK") continue;
                throw new Error("Invalid Fusion Chess export string.");
            }
        }

        // Set king fused pieces state
        this.#king_fused = {};
        if (fusedPieces.length > 0) {
            const kingFused = fusedPieces.filter((piece) => piece.includes("K"));
            for (const fusion of kingFused) {
                this.#king_fused = { ...this.#king_fused, [fusion.slice(0, 2)]: fusion.slice(-1) };
            }
        }

        // Set primary board FEN and fused pieces
        this.load(fen);
        this.fused = fusedPieces;
    }

    // _cannotBlockMate(king: Square) {
    //     let moves;
    //     if (this.isCheck()) {
    //         moves = this.moves().concat(this.#virtual_board.moves({ square: king, verbose: false }));
    //     } else {
    //         moves = this.moves({ square: king, verbose: false }).concat(this.#virtual_board.moves());
    //     }
    //     return moves.length === 0;
    // }

    // findChecker(): Square | undefined {
    //     // Scan every square for a square that is checking the king
    //     for (const square of SQUARES) {
    //         const piece = this.get(square);
    //         if (piece && piece.color !== this.turn()) {
    //             // Get the moves for the piece
    //             const moves = this.moves({ square: square as Square, verbose: true });
    //             // Check if the moves include the king
    //             for (const move of moves) {
    //                 if (move.to.includes(this.findKing() as string)) {
    //                     return square as Square;
    //                 }
    //             }
    //         }
    //     }
    //     return undefined;
    // }
}

export const PIECES = ["p", "n", "b", "r", "q", "k"];

/**
 * Special error to differentiate between errors thrown by the chess.js library and errors thrown by the FusionBoard.
 */
class SafeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SafeError";
    }
}
