import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSizes, Spacing } from '../constants/theme';

type PolicySection = {
  title: string;
  body?: string;
  bullets?: string[];
};

interface PolicyPageProps {
  title: string;
  updated: string;
  intro: string;
  sections: PolicySection[];
}

export default function PolicyPage({ title, updated, intro, sections }: PolicyPageProps) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Link href="/" asChild>
          <TouchableOpacity style={styles.backLink}>
            <Ionicons name="arrow-back" size={16} color={Colors.accent} />
            <Text style={styles.backText}>ReversR Rebuild</Text>
          </TouchableOpacity>
        </Link>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.updated}>Last updated: {updated}</Text>
        <Text style={styles.intro}>{intro}</Text>
      </View>

      {sections.map(section => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.body && <Text style={styles.body}>{section.body}</Text>}
          {section.bullets?.map(item => (
            <View key={item} style={styles.bulletRow}>
              <Text style={styles.bullet}>-</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark,
  },
  content: {
    width: '100%',
    maxWidth: 860,
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  header: {
    marginBottom: Spacing.xl,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  backText: {
    color: Colors.accent,
    fontSize: FontSizes.sm,
    fontWeight: '700',
  },
  title: {
    color: Colors.white,
    fontSize: FontSizes.xxxl,
    fontWeight: '800',
    marginBottom: Spacing.sm,
  },
  updated: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    marginBottom: Spacing.lg,
  },
  intro: {
    color: Colors.gray[300],
    fontSize: FontSizes.md,
    lineHeight: 24,
  },
  section: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    color: Colors.white,
    fontSize: FontSizes.lg,
    fontWeight: '800',
    marginBottom: Spacing.sm,
  },
  body: {
    color: Colors.gray[300],
    fontSize: FontSizes.sm,
    lineHeight: 22,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  bullet: {
    color: Colors.accent,
    fontSize: FontSizes.sm,
    lineHeight: 22,
  },
  bulletText: {
    flex: 1,
    color: Colors.gray[300],
    fontSize: FontSizes.sm,
    lineHeight: 22,
  },
});
