import React from "react";
import { useState } from "react";
import Form from "react-bootstrap/Form";
import Button from "react-bootstrap/Button";
import Stack from "react-bootstrap/Stack";

import configuration from "./configuration";
import useTranslation from "./language";
import Mixings from "./mixings";

interface SettingsProps {
    cluster: Cluster;
    mixings: number;
    traits: string;
    geyserFilters: Array<GeyserFilterRule>;
    onChange: (
        cluster: number,
        mixings: number,
        traits: string,
        geyserFilters: Array<GeyserFilterRule>
    ) => void;
}

interface TraitItemProps {
    options: string;
    value: string;
    onChange: (value: string) => void;
}

const TraitItem = ({ options, value, onChange }: TraitItemProps) => {
    const translation = useTranslation();
    const getTraitName = (key: string): string => {
        return configuration.traits.find((trait) => trait.key == key)!.name;
    };
    return (
        <Form.Select
            className="mb-3"
            value={value}
            onChange={(e) => onChange(e.target.value)}
        >
            {Array.from(options).map((item, index) => (
                <option key={index} value={item}>
                    {translation(getTraitName(item))}
                </option>
            ))}
        </Form.Select>
    );
};

const geyserOptions = [
    ...configuration.geyser.map((item, index) => ({ index, ...item })),
    ...configuration.geyserFilterGroups.map((item) => ({
        index: item.type,
        ...item,
    })),
];

const Settings = ({
    cluster,
    mixings,
    traits,
    geyserFilters,
    onChange,
}: SettingsProps) => {
    const getTraits = (index: number) => {
        const cluster = configuration.cluster[index];
        return Array<string>(cluster.max).fill(cluster.traits);
    };
    const filterTraits = (traits: string, enable: string) => {
        traits = traits.replace(enable, "");
        if (enable === "F" || enable === "H") {
            // geo active/dorment
            traits = traits.replace(/[FH]/, "");
        }
        if (enable === "4" || enable === "E") {
            // core traits
            traits = traits.replace(/[4E]/, "");
        }
        if (enable === "L" || enable === "M") {
            // metal rich/poor
            traits = traits.replace(/[LM]/, "");
        }
        return traits;
    };
    const fillTraitOptions = (traits: Array<string>) => {
        return getTraits(cluster.index).map((item, index1) => {
            traits.forEach((trait, index2) => {
                if (trait !== "Z" && index1 !== index2) {
                    item = filterTraits(item, trait);
                }
            });
            return item;
        });
    }
    const initOptions = fillTraitOptions(traits.split(""));
    const [traitOptions, setTraitOptions] = useState(initOptions);
    const translation = useTranslation();
    const updateSettings = (
        nextCluster: number,
        nextMixings: number,
        nextTraits: string,
        nextGeyserFilters: Array<GeyserFilterRule>
    ) => {
        onChange(nextCluster, nextMixings, nextTraits, nextGeyserFilters);
    };
    const onCategoryChange = (value: number) => {
        const cluster = value === 0 ? 0 : value === 1 ? 13 : 27;
        setTraitOptions(getTraits(cluster));
        updateSettings(cluster, mixings, "ZZZZ", geyserFilters);
    };
    const onClusterChange = (value: number) => {
        setTraitOptions(getTraits(value));
        updateSettings(value, mixings, "ZZZZ", geyserFilters);
    };
    const onMixingsChange = (value: number) => {
        updateSettings(cluster.index, value, traits, geyserFilters);
    };
    const onTraitsChange = (enable: string, index: number) => {
        const traitsArray = traits.split("");
        traitsArray[index] = enable;
        const options = fillTraitOptions(traitsArray);
        setTraitOptions(options);
        updateSettings(
            cluster.index,
            mixings,
            traitsArray.join(""),
            geyserFilters
        );
    };
    const onAddGeyserFilter = () => {
        updateSettings(cluster.index, mixings, traits, [
            ...geyserFilters,
            { index: geyserOptions[0].index, min: 0, max: 99 },
        ]);
    };
    const onRemoveGeyserFilter = (index: number) => {
        updateSettings(
            cluster.index,
            mixings,
            traits,
            geyserFilters.filter((_, itemIndex) => itemIndex !== index)
        );
    };
    const onGeyserFilterChange = (
        index: number,
        patch: Partial<GeyserFilterRule>
    ) => {
        const nextFilters = geyserFilters.map((item, itemIndex) => {
            if (itemIndex !== index) {
                return item;
            }
            const nextItem = { ...item, ...patch };
            if (nextItem.max < nextItem.min) {
                nextItem.max = nextItem.min;
            }
            return nextItem;
        });
        updateSettings(cluster.index, mixings, traits, nextFilters);
    };
    const labels = ["Asteroid", "Planetoid Cluster", "Moonlet Cluster"];
    return (
        <Form>
            <Form.Group className="mb-3" controlId="mode">
                <Form.Label>{translation("Game Mode")}</Form.Label>
                <Form.Select
                    aria-label="Game Mode"
                    defaultValue={cluster.type}
                    onChange={(e) => {
                        onCategoryChange(parseInt(e.target.value));
                    }}
                >
                    {configuration.game.map((item, index) => (
                        <option key={index} value={index}>
                            {translation(item.name)}
                        </option>
                    ))}
                </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3" controlId="cluster">
                <Form.Label>{translation(labels[cluster.type])}</Form.Label>
                <Form.Select
                    aria-label={cluster.name}
                    value={cluster.index}
                    onChange={(e) => {
                        onClusterChange(parseInt(e.target.value));
                    }}
                >
                    {configuration.cluster
                        .filter((item) => item.type === cluster.type)
                        .map((item, index) => (
                            <option key={index} value={item.index}>
                                {translation(item.name)}
                            </option>
                        ))}
                </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
                <Form.Label>{translation("World Traits")}</Form.Label>
                {traitOptions.map((item, index) => (
                    <TraitItem
                        key={index}
                        value={traits.at(index) || "Z"}
                        options={item}
                        onChange={(value) => onTraitsChange(value, index)}
                    />
                ))}
            </Form.Group>
            <Form.Group className="mb-3">
                <Form.Label>{translation("Geyser Filters")}</Form.Label>
                <Stack gap={2}>
                    {geyserFilters.length === 0 && (
                        <div>{translation("No geyser filters")}</div>
                    )}
                    {geyserFilters.map((item, index) => (
                        <Stack
                            key={index}
                            gap={2}
                            className="border rounded p-2"
                        >
                            <Form.Group>
                                <Form.Label>{translation("Target")}</Form.Label>
                                <Form.Select
                                    value={item.index}
                                    onChange={(e) =>
                                        onGeyserFilterChange(index, {
                                            index: parseInt(e.target.value),
                                        })
                                    }
                                >
                                    {geyserOptions.map((option) => (
                                        <option
                                            key={option.index}
                                            value={option.index}
                                        >
                                            {translation(option.name)}
                                        </option>
                                    ))}
                                </Form.Select>
                            </Form.Group>
                            <Stack direction="horizontal" gap={2}>
                                <Form.Group className="w-100">
                                    <Form.Label>
                                        {translation("Minimum")}
                                    </Form.Label>
                                    <Form.Control
                                        type="number"
                                        min={0}
                                        value={item.min}
                                        onChange={(e) =>
                                            onGeyserFilterChange(index, {
                                                min: Math.max(
                                                    0,
                                                    parseInt(e.target.value) ||
                                                        0
                                                ),
                                            })
                                        }
                                    />
                                </Form.Group>
                                <Form.Group className="w-100">
                                    <Form.Label>
                                        {translation("Maximum")}
                                    </Form.Label>
                                    <Form.Control
                                        type="number"
                                        min={item.min}
                                        value={item.max}
                                        onChange={(e) =>
                                            onGeyserFilterChange(index, {
                                                max: Math.max(
                                                    0,
                                                    parseInt(e.target.value) ||
                                                        0
                                                ),
                                            })
                                        }
                                    />
                                </Form.Group>
                            </Stack>
                            <div>
                                <Button
                                    variant="outline-danger"
                                    size="sm"
                                    onClick={() => onRemoveGeyserFilter(index)}
                                >
                                    {translation("Remove")}
                                </Button>
                            </div>
                        </Stack>
                    ))}
                    <div>
                        <Button
                            variant="outline-primary"
                            size="sm"
                            onClick={onAddGeyserFilter}
                        >
                            {translation("Add Filter")}
                        </Button>
                    </div>
                </Stack>
            </Form.Group>
            <Form.Group className="mb-3">
                <Form.Label>{translation("Scramble DLCs")}</Form.Label>
            </Form.Group>
            {configuration.mixing
                .filter((item) => item.key[2] === "p")
                .map((item, index) => (
                    <Mixings
                        key={index}
                        index={cluster.type}
                        name={item.key}
                        active={mixings}
                        onSetActive={(active) => {
                            onMixingsChange(active);
                        }}
                    />
                ))}
        </Form>
    );
};

export default Settings;
