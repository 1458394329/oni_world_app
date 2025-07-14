import React from "react";
import { useState } from "react";
import { Button, Container, Form, InputGroup } from "react-bootstrap";
import { Navbar, Offcanvas, Stack } from "react-bootstrap";

import configuration from "./configuration";
import useTranslation from "./language";
import Settings from "./settings";
import NavRight from "./navright";

interface ToolBarProps {
    theme: number;
    onSetTheme: (lang: string, theme: number) => void;
    onSetWorld: () => void;
}

const ToolBar = ({ theme, onSetTheme, onSetWorld }: ToolBarProps) => {
    const [drawer, setDrawer] = useState(true);
    const [category, setCategory] = useState(0);
    const [clusters, setClusters] = useState([0, 13, 27]);
    const [mixings, setMixings] = useState(9769375);
    const [seed, setSeed] = useState("");
    const translation = useTranslation();
    const toBase36 = (num: number) => {
        if (num === 0) return "0";
        const hexChars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let text = "";
        while (num > 0) {
            text += hexChars[num % 36];
            num = Math.floor(num / 36);
        }
        return text;
    };
    const generateWorld = (nseed: number) => {
        const cluster = clusters[category];
        Module.worlds.length = 0;
        Module.app_generate(cluster, nseed, mixings);
        setSeed(Module.worlds[0].seed.toString());
        onSetWorld();
    };
    const copyToClipboard = async (text: string): Promise<void> => {
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {}
    };
    const onReroll = () => {
        const nseed = Math.round(Math.random() * 0x7fffffff);
        generateWorld(nseed);
    };
    const onCopy = () => {
        const cluster = clusters[category];
        const name = configuration.cluster[cluster].key;
        const mix = toBase36(mixings);
        const sseed = `${name}-${seed}-0-D3-${mix}`;
        copyToClipboard(sseed);
    };
    const onSubmit = () => {
        setDrawer(false);
        let nseed = 0;
        if (seed.length === 0) {
            nseed = Math.round(Math.random() * 0x7fffffff);
        } else {
            nseed = parseInt(seed);
        }
        generateWorld(nseed);
    };
    return (
        <>
            <InputGroup>
                <Button onClick={() => setDrawer(true)}>
                    {translation("Settings")}
                </Button>
                <Form.Control
                    id="seed"
                    type="text"
                    value={seed}
                    placeholder={translation("Worldgen Seed")}
                    onChange={(e) => setSeed(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            generateWorld(parseInt(seed));
                        }
                    }}
                />
                <Button key="reroll" onClick={onReroll}>
                    {translation("Reroll")}
                </Button>
                <Button key="copy" onClick={onCopy}>
                    {translation("Copy")}
                </Button>
            </InputGroup>
            <Offcanvas show={drawer} onHide={() => setDrawer(false)}>
                <Navbar className="justify-content-between">
                    <Container>
                        <div className="hstack">
                            <Button onClick={onSubmit}>
                                {translation("Submit")}
                            </Button>
                        </div>
                        <div className="d-flex d-md-none hstack gap-3">
                            <NavRight theme={theme} onSetTheme={onSetTheme} />
                        </div>
                    </Container>
                </Navbar>
                <Offcanvas.Body>
                    <Settings
                        category={category}
                        clusters={clusters}
                        mixings={mixings}
                        onChange={(category, cluster, mixings) => {
                            setCategory(category);
                            setClusters(
                                clusters.map((item, index) =>
                                    index === category ? cluster : item
                                )
                            );
                            setMixings(mixings);
                        }}
                    />
                </Offcanvas.Body>
            </Offcanvas>
        </>
    );
};

export default ToolBar;
