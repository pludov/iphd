import * as React from 'react';
import './HelpOverlay.css';


export type KeyRenderer = string | (()=>React.ReactNode);


export class Key {
    private id: string;
    title: string;
    details?: KeyRenderer;
    private static nextId = 0;
    private static dictionary = new Map<string, Key>();

    constructor(title : string, details?:KeyRenderer) {
        this.title = title;
        this.details = details;
        this.id = "HelpKey" + (Key.nextId++);
        Key.dictionary.set(this.id, this);
    }

    public readonly dom =()=>({
        "data-help": this.id,
        "title": this.title + (typeof this.details === "string" ? "\n" + this.details : ""),
    });

    public static readonly byId=(id:string)=>{
        return Key.dictionary.get(id);
    }
}


export function key(title: string, details?: KeyRenderer): Key
{
    if (details === undefined) {
        return new Key(title);
    } else {
        if (typeof title === "string") {
            return new Key(title, details);
        }
        throw new Error("title cannot be a KeyRenderer");
    }
}