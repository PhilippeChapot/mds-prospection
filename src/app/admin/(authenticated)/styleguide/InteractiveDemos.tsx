'use client';

import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

export function DialogDemo() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Ouvrir un dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmer la suppression</DialogTitle>
          <DialogDescription>
            Cette action est irreversible. Les donnees seront definitivement supprimees.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Annuler</Button>
          </DialogClose>
          <Button variant="destructive">Supprimer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ToastDemo() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => toast.success('Sauvegarde reussie.')}>
        Toast success
      </Button>
      <Button variant="outline" onClick={() => toast.error('Echec du paiement Stripe.')}>
        Toast error
      </Button>
      <Button
        variant="outline"
        onClick={() =>
          toast.message('Synchronisation Sellsy', {
            description: 'En cours · 12 / 47 societes traitees',
          })
        }
      >
        Toast info
      </Button>
    </div>
  );
}

export function SelectDemo() {
  return (
    <Select defaultValue="standard">
      <SelectTrigger className="w-64">
        <SelectValue placeholder="Categorie tarifaire" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="prs_exhibitor">PRS exposant</SelectItem>
        <SelectItem value="standard">Standard</SelectItem>
        <SelectItem value="non_eligible">Non eligible</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function TabsDemo() {
  return (
    <Tabs defaultValue="general" className="w-full max-w-md">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="contacts">Contacts</TabsTrigger>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
      </TabsList>
      <TabsContent value="general" className="text-md-text-muted text-sm">
        Onglet General : nom societe, pole, categorie, domaine.
      </TabsContent>
      <TabsContent value="contacts" className="text-md-text-muted text-sm">
        Onglet Contacts : email, telephone, role.
      </TabsContent>
      <TabsContent value="timeline" className="text-md-text-muted text-sm">
        Onglet Timeline : activites du prospect dans l&apos;ordre antichronologique.
      </TabsContent>
    </Tabs>
  );
}

export function ComboboxDemo() {
  return (
    <Command className="border-md-border w-full max-w-md rounded-md border">
      <CommandInput placeholder="Rechercher une societe…" />
      <CommandList>
        <CommandEmpty>Aucune societe trouvee.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem>NRJ Group</CommandItem>
          <CommandItem>Radio France</CommandItem>
          <CommandItem>Europe 1</CommandItem>
          <CommandItem>RTL Group</CommandItem>
          <CommandItem>Mediawan Radio</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
