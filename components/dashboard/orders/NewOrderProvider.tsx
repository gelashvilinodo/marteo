"use client";

import {
    createContext,
    useContext,
    useState,
    type ReactNode,
} from "react";

import type { getOrder } from "@/lib/orders/get-order";

type EditableOrder = Awaited<ReturnType<typeof getOrder>>;

type NewOrderContextType = {
    isOpen: boolean;
    editingOrder: EditableOrder | null;
    openNewOrder: () => void;
    openEditOrder: (order: EditableOrder) => void;
    closeNewOrder: () => void;
    holdOrderSession: (held: boolean) => void;
};

const NewOrderContext = createContext<NewOrderContextType | null>(null);

type NewOrderProviderProps = {
    children: ReactNode;
};

export function NewOrderProvider({
    children,
}: NewOrderProviderProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [sessionHeld, setSessionHeld] = useState(false);
    const [editingOrder, setEditingOrder] =
        useState<EditableOrder | null>(null);

    function openNewOrder() {
        if (!isOpen && !sessionHeld) {
            setEditingOrder(null);
        }

        setIsOpen(true);
    }

    function openEditOrder(order: EditableOrder) {
        if (!isOpen && !sessionHeld) {
            setEditingOrder(order);
        }

        setIsOpen(true);
    }

    function closeNewOrder() {
        setIsOpen(false);
    }

    return (
        <NewOrderContext.Provider
            value={{
                isOpen,
                editingOrder,
                openNewOrder,
                openEditOrder,
                closeNewOrder,
                holdOrderSession: setSessionHeld,
            }}
        >
            {children}
        </NewOrderContext.Provider>
    );
}

export function useNewOrder() {
    const context = useContext(NewOrderContext);

    if (!context) {
        throw new Error(
            "useNewOrder must be used inside NewOrderProvider"
        );
    }

    return context;
}