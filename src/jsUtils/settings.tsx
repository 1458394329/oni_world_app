import React from "react";
import Form from "react-bootstrap/Form";

import configuration from "./configuration";
import useTranslation from "./language";
import Mixings from "./mixings";

interface SettingsProps {
    category: number;
    clusters: Array<number>;
    mixings: number;
    onChange: (category: number, cluster: number, mixings: number) => void;
}

const Settings = ({ category, clusters, mixings, onChange }: SettingsProps) => {
    const translation = useTranslation();
    const clusterCategories = [
        { start: 0, end: 13, id: "asteroid", name: "Asteroid" },
        { start: 13, end: 27, id: "cluster", name: "Planetoid Cluster" },
        { start: 27, end: 99, id: "moonlet", name: "Moonlet Cluster" },
    ];
    return (
        <Form>
            <Form.Group className="mb-3" controlId="mode">
                <Form.Label>{translation("Game Mode")}</Form.Label>
                <Form.Select
                    aria-label="Game Mode"
                    defaultValue={category}
                    onChange={(e) => {
                        category = parseInt(e.target.value);
                        onChange(category, clusters[category], mixings);
                    }}
                >
                    {configuration.game.map((item, index) => (
                        <option key={index} value={index}>
                            {translation(item.name)}
                        </option>
                    ))}
                </Form.Select>
            </Form.Group>
            {clusterCategories.map((item, index) => (
                <Form.Group
                    key={index}
                    className="mb-3"
                    controlId={item.id}
                    hidden={category !== index}
                >
                    <Form.Label>{translation(item.name)}</Form.Label>
                    <Form.Select
                        aria-label={item.name}
                        defaultValue={clusters[index] - item.start}
                        onChange={(e) => {
                            const value = parseInt(e.target.value);
                            onChange(category, item.start + value, mixings);
                        }}
                    >
                        {configuration.cluster
                            .slice(item.start, item.end)
                            .map((option, index) => (
                                <option key={index} value={index}>
                                    {translation(option.name)}
                                </option>
                            ))}
                    </Form.Select>
                </Form.Group>
            ))}
            <Form.Group className="mb-3">
                <Form.Label>{translation("Scramble DLCs")}</Form.Label>
            </Form.Group>
            {configuration.mixing
                .filter((item) => item.key[2] === "p")
                .map((item, index) => (
                    <Mixings
                        key={index}
                        index={category}
                        name={item.key}
                        active={mixings}
                        onSetActive={(active) => {
                            onChange(category, clusters[category], active);
                        }}
                    />
                ))}
        </Form>
    );
};

export default Settings;
