# Fusion Chess
**https://fusionchess.vercel.app/** <br>
<img src="https://raw.githubusercontent.com/bubner/FusionChess/prod/public/fchess.png" alt="Fusion Chess" height="200"></img>

## Overview
***Fusion Chess*** is a variant of traditional chess where captured pieces are fused to the capturing piece, giving it their movement and capturing capabilities.<br><br>
If another piece captures the fused piece, it gains the powers of the last piece that had capturing interaction. The king can also gain the powers of a captured piece, but still cannot move into positions where it may be captured.<br><br>
Pawns attached to other pieces may not promote unless certain conditions are met, and conflicting promotions will remove the lower-ranked piece. Capturing a piece of the same movement does not result in fusion.

## Restrictions
- When fusing, the **strongest piece** will always be prioritised as the accompanied piece.
- A queen capturing any other piece other than a knight will not gain any changes, as the queen can already move in the direction of a bishop and rook.
- Capturing a knight with a queen will allow the unique **L-shape movement**, respectively.
- If the king captures a piece, it will gain powers listed by the captured piece, allowing it to escape checks, but still have the restriction of not being allowed to move into positions where it may be captured.
- If a king is attached to a piece, and if another piece is captured, the currently attached piece will not be replaced. The king cannot be replaced and may only fuse once.
- **Pawns attached to other pieces** may not promote when reaching the final rank unless that pawn:
    - originates from your own side of the board
    - is not an opponent’s pawn
    - is not attached or attaching to a queen
    - is moved with pawn movements to the 8th rank, as a pawn being its primary piece
- All promotions are **auto-queen**.
- Pawns may promote as per normal chess rules if not fused. Promoting a piece that has conflicting movement (BPd8=BQ) will remove the lower-ranked piece (BPd8=Q).
- Capturing a piece of the same movement results in **no fusion**, as they are the same piece. For example, pawns capturing each other results in no fusion.

###### Built in React and TypeScript as a school project. <br> Licensed under MIT, using libraries [chess.js](https://github.com/jhlywa/chess.js), [react-chessboard](https://github.com/Clariity/react-chessboard), [stockfish.js](https://github.com/nmrugg/stockfish.js).
