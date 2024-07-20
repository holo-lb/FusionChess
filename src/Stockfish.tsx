8;
/**
 * Stockfish compatibility module for displaying current evaluation status information.
 * Compatible with FEN strings only. Limitations include FusionChess's dual board nature.
 * @author Lucas Bubner, 2023
 */
import { useEffect, useRef, useState, Fragment } from "react";

class Engine {
    engine: Worker;
    fusionengine: Worker;
    eval: string[];
    fen: string[] = ["", ""];
    depth: number;
    evalBarHeight: number;

    constructor(initfen: string, initvfen: string, depth: number) {
        this.engine = new Worker("/stockfish.js");
        this.fusionengine = new Worker("/stockfish.js");
        this.eval = ["0.0", "nil"];
        this.fen[0] = initfen;
        this.fen[1] = initvfen;
        this.depth = depth;
        this.engine.onmessage = (e) => this.onStockfishMessage(e, this.fen, "e");
        this.fusionengine.onmessage = (e) => this.onStockfishMessage(e, this.fen, "v");
        this.evalBarHeight = 50;
    }

    updateFens(fen: string, vfen: string) {
        this.fen[0] = fen;
        this.fen[1] = vfen;
    }

    onStockfishMessage = (event: MessageEvent, fen: string[], engine: "e" | "v") => {
        // console.debug(`SF15: ${event.data}`);
        if (event.data.startsWith("info depth")) {
            let messageEvalType;
            const message = event.data.split(" ");
            // Determine the current turn from the FEN, should be the same
            let turn;
            if (engine === "e") {
                turn = fen[0].split(" ")[1];
            } else {
                turn = fen[1].split(" ")[1];
            }

            if (message.includes("mate")) {
                messageEvalType = `M${message[message.indexOf("mate") + 1]}`;
            } else {
                messageEvalType = message[message.indexOf("cp") + 1];
            }

            const tmp = String(messageEvalType / 100.0);
            let evaluation = tmp;
            const flt = parseFloat(tmp);
            const abs = Math.abs(flt);
            switch (turn) {
                case "w":
                    if (flt > 0) {
                        evaluation = abs.toString();
                    } else if (flt < 0) {
                        evaluation = "-" + abs;
                    }
                    break;
                case "b":
                    if (flt > 0) {
                        evaluation = "-" + abs;
                    } else if (flt < 0) {
                        evaluation = abs.toString();
                    }
                    break;
            }
            // Check if the eval is NaN
            if (evaluation.includes("NaN")) {
                // Must be a M value
                if (messageEvalType === "M0") {
                    messageEvalType = turn === "w" ? "0-1" : "1-0";
                }
                if (engine === "e") {
                    this.eval[0] = messageEvalType;
                } else {
                    this.eval[1] = messageEvalType;
                }
            } else {
                if (engine === "e") {
                    this.eval[0] = evaluation;
                } else {
                    this.eval[1] = evaluation;
                }
            }

            let heightEval: number;
            const choseneval = this.chooseAppropriateEval();
            if (choseneval.startsWith("M")) {
                // Is checkmate in X, fill the whole bar depending on which side is winning
                heightEval =
                    (turn === "w" && !choseneval.includes("-")) || (turn === "b" && choseneval.includes("-")) ? 0 : 100;
            } else {
                heightEval = choseneval.startsWith("-")
                    ? 50 + this._calcHeight(Math.abs(Number(choseneval)))
                    : 50 - this._calcHeight(Math.abs(Number(choseneval)));
            }
            this.evalBarHeight = heightEval;
        }
    };

    matchEngine(evaluation: "s" | "v" | "n") {
        switch (evaluation) {
            case this.eval[0]:
                return "s";
            case this.eval[1]:
                return "v";
            default:
                return "n";
        }
    }

    chooseAppropriateEval() {
        // console.debug(`SF15 eval: ${this.eval}`);
        if (this.eval[0] === "info" && this.eval[1] === "info") {
            // Both engines are thinking
            return "info";
        }

        if (this.eval[1] === "nil" || this.eval[1] === "info") return this.eval[0];
        if (this.eval[0] === "info") return this.eval[1];

        // Return the evaluation with the strongest score
        if (this.eval[0].startsWith("M") || this.eval[0].startsWith("0-") || this.eval[0].startsWith("1-")) {
            return this.eval[0];
        } else if (this.eval[1].startsWith("M") || this.eval[0].startsWith("0-") || this.eval[0].startsWith("1-")) {
            return this.eval[1];
        }

        const lowest = Math.min(parseFloat(this.eval[0]), parseFloat(this.eval[1]));
        const highest = Math.max(parseFloat(this.eval[0]), parseFloat(this.eval[1]));

        if (this.eval[0].startsWith("-") && this.eval[1].startsWith("-")) {
            // Both engines say black is winning
            return String(lowest.toFixed(1));
        } else if (!this.eval[0].startsWith("-") && !this.eval[1].startsWith("-")) {
            // Both engines say white is winning
            return String(highest.toFixed(1));
        } else {
            // Engines conflict on who is winning, return some magic
            const magic = highest / lowest;
            return String(magic.toFixed(1));
        }
    }

    private _calcHeight = (x: number) => {
        // Height calculation code for eval bar. Don't ask what it does, I don't know either, but it somehow works.
        // https://github.com/trevor-ofarrell/chess-evaluation-bar/blob/57ea5d6ae8b63c3a2b0fbf4b7ef7af89dfeef6b1/dist/components/EvalBar.js#L70-L78
        if (x === 0) {
            return 0;
        } else if (x < 7) {
            return -(0.322495 * Math.pow(x, 2)) + 7.26599 * x + 4.11834;
        } else {
            return (8 * x) / 145 + 5881 / 145;
        }
    };
}

function Stockfish({ fen, vfen, depth, shouldRun }: { fen: string; vfen: string; depth: number; shouldRun: boolean }) {
    const stockfish = useRef<Engine | null>(null);
    const [evals, setEvals] = useState<string>("0.0");
    const [eData, setEdata] = useState<Array<string>>([]);
    const [heightDef, setHeightDef] = useState<number>(75);

    useEffect(() => {
        setEdata(["Setting up Stockfish 15..."]);
        const reqs = [new XMLHttpRequest(), new XMLHttpRequest(), new XMLHttpRequest()];
        reqs[0].open("HEAD", "/stockfish.js", false);
        reqs[1].open("HEAD", "/stockfish.wasm", false);
        reqs[2].open("HEAD", document.location.pathname, false);
        reqs.forEach((req) => req.send());

        const headers = reqs[2].getAllResponseHeaders();
        const noHeaders =
            !headers.includes("cross-origin-embedder-policy:") || !headers.includes("cross-origin-opener-policy:");

        if (reqs[0].status === 404) {
            setEdata((eData) => [...eData, "E: Could not find stockfish.js file."]);
        } else {
            setEdata((eData) => [...eData, "Found stockfish.js."]);
        }

        if (reqs[1].status === 404) {
            setEdata((eData) => [...eData, "E: Could not find WebAssembly binary."]);
        } else {
            setEdata((eData) => [...eData, "Found WebAssembly binary."]);
        }

        if (noHeaders) {
            if (!headers.includes("cross-origin-embedder-policy:")) {
                setEdata((eData) => [
                    ...eData,
                    "E: Cross-Origin-Embedder-Policy HTTP header is not set to 'require-corp'.",
                ]);
            }
            if (!headers.includes("cross-origin-opener-policy:")) {
                setEdata((eData) => [
                    ...eData,
                    "E: Cross-Origin-Opener-Policy HTTP header is not set to 'same-origin'.",
                ]);
            }
        } else {
            setEdata((eData) => [...eData, "Cross-origin isolation is enabled."]);
        }

        if (reqs[0].status === 404 || reqs[1].status === 404 || noHeaders) {
            setEdata((eData) => [...eData, "Configuration has failed."]);
            setEvals("⌀");
        } else {
            setEdata((eData) => [...eData, "Stockfish 15 is ready."]);
            setEvals("0.0");
        }

        setHeightDef(50);
        stockfish.current = new Engine(fen, vfen, depth);
        stockfish.current.engine.postMessage("uci");
        stockfish.current.engine.postMessage("ucinewgame");
        stockfish.current.fusionengine.postMessage("uci");
        stockfish.current.fusionengine.postMessage("ucinewgame");

        // Use a debounce timeout to prevent the eval from updating rapidly
        let debounceTimeout: ReturnType<typeof setTimeout>;

        const updateEval = (event: MessageEvent, type: string) => {
            if (shouldRun) {
                setEdata((eData) => [
                    ...eData,
                    `[${type} ${new Date(Date.now()).toLocaleString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                    })}] ${event.data}`,
                ]);
            } else {
                setEdata(["Game end condition reached.", "Stockfish 15 evaluation halted."]);
                return;
            }
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                // Do not set evals if the stockfish.current?.eval value is 'info' meaning that there is no evaluation ready
                // This happens in higher depth analysis above 20, where it takes a lot of computing power to execute
                const evaluation = stockfish.current?.chooseAppropriateEval();
                if (evaluation && evaluation !== "NaN" && evaluation !== "info") setEvals(evaluation);
                // Don't set the eval height if it is NaN, we cannot translate it and it usually only comes up when it is M0 (checkmate)
                if (!stockfish.current) return;
                if (!isNaN(stockfish.current.evalBarHeight)) {
                    setHeightDef(stockfish.current.evalBarHeight);
                }
            }, 500);
        };
        stockfish.current?.engine.addEventListener("message", (e) => updateEval(e, "s"));
        stockfish.current?.fusionengine.addEventListener("message", (e) => updateEval(e, "v"));

        return () => {
            stockfish.current?.engine.removeEventListener("message", (e) => updateEval(e, "s"));
            stockfish.current?.fusionengine.removeEventListener("message", (e) => updateEval(e, "v"));
            // Avoid any cataclysmic quantum resonance cascades by freeing web worker memory
            stockfish.current?.engine.terminate();
            stockfish.current?.fusionengine.terminate();
        };
    }, []);

    useEffect(() => {
        if (!fen) return;

        stockfish.current?.updateFens(fen, vfen);

        // Run classical evaluation with Stockfish 15
        stockfish.current?.engine.postMessage(`position fen ${fen}`);
        stockfish.current?.engine.postMessage(`go depth ${depth}`);
        if (vfen !== fen) {
            stockfish.current?.fusionengine.postMessage(`position fen ${vfen}`);
            stockfish.current?.fusionengine.postMessage(`go depth ${depth}`);
        }
    }, [fen, depth]);

    useEffect(() => {
        if (!shouldRun) {
            stockfish.current?.engine.postMessage("uci");
            stockfish.current?.engine.postMessage("ucinewgame");
            stockfish.current?.fusionengine.postMessage("uci");
            stockfish.current?.fusionengine.postMessage("ucinewgame");
        }
    }, [shouldRun]);

    return (
        <>
            <div id="evalbar">
                <div
                    style={{
                        height: "98%",
                        width: "3%",
                        backgroundColor: "white",
                        position: "absolute",
                        zIndex: "-1",
                        borderRadius: "10px",
                        transform: "translateX(-125%)",
                    }}
                />
                <div
                    style={{
                        height: heightDef + "%",
                        width: "3.1vw",
                        backgroundColor: "#1a1a1a",
                        transition: "height 1s",
                        zIndex: "-1",
                        borderRadius: "8px 8px 0 0",
                        transform: "translateX(-121%)",
                    }}
                />
                <div
                    style={{
                        transform: `translate(-160%, ${heightDef}%)`,
                        transition: "transform 1s",
                        textAlign: "center",
                        zIndex: "-1",
                        fontWeight: "bold",
                        display:
                            evals.startsWith("M") || evals.startsWith("1-") || evals.startsWith("0-")
                                ? "none"
                                : "block",
                    }}
                >
                    {evals}
                </div>
                <p
                    style={{
                        transform: `translate(-160%, ${heightDef > 50 ? -51 : 46}vh)`,
                        transition: "transform 1s, display 1s",
                        textAlign: "center",
                        fontWeight: "bold",
                        zIndex: "-1",
                        display:
                            evals.startsWith("M") || evals.startsWith("1-") || evals.startsWith("0-")
                                ? "block"
                                : "none",
                        color: heightDef > 50 ? "white" : "black",
                    }}
                >
                    {evals.startsWith("M") ? evals.replace("-", "") : evals}
                </p>
            </div>
            <div id="stockfish" style={{ textAlign: "center" }}>
                <p className="title">Stockfish 15</p>
                <b>(Caution: EXPERIMENTAL)</b> <br />
                Status: {evals === "⌀" ? "UNAVAILABLE" : fen ? "ACTIVE" : "STANDBY"} <br />
                Merged engine evaluation: {evals.startsWith("M") ? evals.replace("-", "") : evals} <br />
                <b>Main: {stockfish.current?.eval[0]}, Virt: {stockfish.current?.eval[1]}</b> <br />
                Max depth={depth} <br /> <br />
                <div
                    className="scrollelement"
                    style={{
                        fontFamily: "Lucida Console, sans-serif",
                        border: "2px solid grey",
                        padding: "12px",
                        textAlign: "left",
                        minHeight: "60vh",
                        maxHeight: "60vh",
                        overflowY: "scroll",
                        whiteSpace: "nowrap",
                        background: "#000",
                    }}
                >
                    {eData.map((d, i) => (
                        <Fragment key={i}>
                            {d} <br />
                        </Fragment>
                    ))}
                </div>
            </div>
        </>
    );
}

export default Stockfish;
