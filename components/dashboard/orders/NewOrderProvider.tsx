"use client";

import {
    createContext,
    useContext,
    useState,
    type ReactNode,
} from "react";

type NewOrderContextType = {
    isOpen: boolean;
    openNewOrder: () => void;
    closeNewOrder: () => void;
};

const NewOrderContext = createContext<NewOrderContextType | null>(null);

type NewOrderProviderProps = {
    children: ReactNode;
};

export function NewOrderProvider({
    children,
}: NewOrderProviderProps) {
    const [isOpen, setIsOpen] = useState(false);

    function openNewOrder() {
        setIsOpen(true);
    }

    function closeNewOrder() {
        setIsOpen(false);
    }

    return (
        <NewOrderContext.Provider
            value={{
                isOpen,
                openNewOrder,
                closeNewOrder,
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