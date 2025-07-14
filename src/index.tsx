import React from "react";
import { useState, useEffect, useContext } from "react";
import { createRoot } from "react-dom/client";
import { Navbar, Container, Stack, Row, Col } from "react-bootstrap";
import { Card, Modal } from "react-bootstrap";

import { LanguageContext, useTranslation } from "./jsUtils/language";
import configuration from "./jsUtils/configuration";
import WorldCanvas from "./jsUtils/worldcanvas";
import ToolBar from "./jsUtils/toolbar";
import NavRight from "./jsUtils/navright";
import { updateWorld } from "./jsUtils";

import "bootstrap/dist/css/bootstrap.min.css";
import "./jsUtils/index.css";

const WorldInfo = ({ world }: { world: World }) => {
    const translation = useTranslation();
    const convert = (color?: number) => {
        const list = ["success", "danger", "primary"];
        return color ? list[color - 1] : undefined;
    };
    const traits = configuration.traits;
    return (
        <>
            <Row xs={2} md={4}>
                {world.traits.map((item, index) => (
                    <Card key={index} text={convert(traits[item].type)}>
                        <Card.Body>{translation(traits[item].name)}</Card.Body>
                    </Card>
                ))}
            </Row>
            <Row xs={2} md={4}>
                {world.geysers.map((item, index) => (
                    <Card key={index} text={convert(item.desc.type)}>
                        <Card.Body>{translation(item.desc.name)}</Card.Body>
                    </Card>
                ))}
            </Row>
        </>
    );
};

const createSprite = (e: Event) => {
    const promises = [];
    const image = e.target as HTMLImageElement;
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
            const promise = createImageBitmap(image, j * 32, i * 32, 32, 32);
            promises.push(promise);
        }
    }
    Promise.all(promises).then((sprites) => Module.sprite.push(...sprites));
};

const App = ({ onSetLanguage }: { onSetLanguage: (lang: string) => void }) => {
    const [loading, setLoading] = useState(true);
    const [worlds, setWorlds] = useState(new Array<World>());
    const [theme, setTheme] = useState(0);
    const language = useContext(LanguageContext);
    const translation = useTranslation();
    useEffect(() => {
        document.title = translation("ONI World Generator");
    }, [language]);
    useEffect(() => {
        if (Module.wasm !== undefined) return;
        Module.wasm = null;
        Module.worlds = [];
        Module.sprite = [];
        Module.updateWorld = updateWorld;
        Module.onRuntimeInitialized = () => {
            Module.app_init(new Date().getTime() & 0x7fffffff);
            setLoading(false);
        };
        setLoading(true);
        const load = async (url: string) => {
            const response = await fetch(url, { credentials: "same-origin" });
            return response.arrayBuffer();
        };
        (process.env.NODE_ENV === "development"
            ? import("../out/build/wasm-debug/src/WasmFiles")
            : import("../out/build/wasm-release/src/WasmFiles")
        ).then((module) => {
            Promise.all([
                load(module.WasmFiles.data),
                load(module.WasmFiles.wasm),
            ])
                .then((buffers) => {
                    Module.data = new Uint8Array(buffers[0], 4);
                    Module.wasm = new Uint8Array(buffers[1]);
                    const script = document.createElement("script");
                    script.src = module.WasmFiles.launcher;
                    script.async = true;
                    document.body.appendChild(script);
                })
                .catch((reason) => console.log("fetch error: " + reason));
        });
        const image = new Image();
        image.onload = createSprite;
        image.src = "zones.png?2";
        //if ("serviceWorker" in navigator) {
        //    navigator.serviceWorker.register("./serviceworker.js");
        //}
    }, []);
    const onSetWorlds = () => setWorlds([...Module.worlds]);
    const onSetTheme = (lang: string, theme: number) => {
        onSetLanguage(lang);
        setTheme(theme);
        const expect = theme === 0 ? "light" : "dark";
        document.documentElement.setAttribute("data-bs-theme", expect);
    };
    return (
        <>
            <Navbar className="bg-body-tertiary justify-content-between">
                <Container>
                    <Stack direction="horizontal">
                        <ToolBar
                            theme={theme}
                            onSetTheme={onSetTheme}
                            onSetWorld={onSetWorlds}
                        />
                    </Stack>
                    <Stack
                        direction="horizontal"
                        className="d-none d-md-flex"
                        gap={3}
                    >
                        <NavRight theme={theme} onSetTheme={onSetTheme} />
                    </Stack>
                </Container>
            </Navbar>
            <Container>
                <Row>
                    <Col lg={12} xl={6}>
                        {worlds.map((world, index) => (
                            <WorldInfo key={index} world={world} />
                        ))}
                    </Col>
                    <WorldCanvas worlds={worlds} theme={theme} />
                </Row>
            </Container>
            <Modal
                id="loading"
                show={loading}
                backdrop="static"
                keyboard={false}
                centered
            >
                <Modal.Body>
                    {translation("Initializing, please wait a moment.")}
                </Modal.Body>
            </Modal>
        </>
    );
};

const Main: React.FC = () => {
    const [language, setLanguage] = useState(navigator.language);
    return (
        <LanguageContext.Provider value={language}>
            <App onSetLanguage={(lang) => setLanguage(lang)} />
        </LanguageContext.Provider>
    );
};

const root = createRoot(document.getElementById("root")!);
if (process.env.NODE_ENV === "development") {
    root.render(
        <React.StrictMode>
            <Main />
        </React.StrictMode>
    );
} else {
    root.render(<Main />);
}
